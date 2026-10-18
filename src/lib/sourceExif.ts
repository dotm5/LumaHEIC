// Keep original TIFF-relative offsets intact: append replacement directories,
// rather than relocating opaque camera/GPS metadata. Input pixels are not copied.
const maxExifBytes = 1024 * 1024
const typeSizes = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8, 4]
const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length))

type Entry = { tag: number; raw: Uint8Array }

function tiff(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const little = ascii(bytes, 0, 2) === 'II'
  if (bytes.length < 8 || (!little && ascii(bytes, 0, 2) !== 'MM') || view.getUint16(2, little) !== 42) {
    throw new Error('Invalid EXIF TIFF header')
  }
  const readIfd = (offset: number): Entry[] => {
    if (offset < 8 || offset + 2 > bytes.length) throw new Error('Invalid EXIF directory')
    const count = view.getUint16(offset, little)
    if (count > 4096) throw new Error('Too many EXIF entries')
    if (offset + 2 + count * 12 + 4 > bytes.length) throw new Error('Truncated EXIF directory')
    return Array.from({ length: count }, (_, i) => {
      const pos = offset + 2 + i * 12
      const type = view.getUint16(pos + 2, little)
      const size = typeSizes[type] * view.getUint32(pos + 4, little)
      if (!typeSizes[type] || !Number.isSafeInteger(size)) throw new Error('Invalid EXIF type')
      if (size > 4 && view.getUint32(pos + 8, little) + size > bytes.length) throw new Error('Truncated EXIF value')
      return { tag: view.getUint16(pos, little), raw: bytes.slice(pos, pos + 12) }
    })
  }
  const pointer = (entry: Entry) => new DataView(entry.raw.buffer).getUint32(8, little)
  const root = readIfd(view.getUint32(4, little))
  const exifPointer = root.find((entry) => entry.tag === 0x8769)
  const exif = exifPointer ? readIfd(pointer(exifPointer)) : []
  // Validate the standard child directories too, with a bounded traversal.
  const visited = new Set<number>()
  const validateChildren = (entries: Entry[], depth: number) => {
    if (depth > 4) throw new Error('EXIF directory nesting is too deep')
    for (const entry of entries) {
      if (![0x8769, 0x8825, 0xa005].includes(entry.tag)) continue
      const ev = new DataView(entry.raw.buffer)
      if (ev.getUint16(2, little) !== 4 || ev.getUint32(4, little) !== 1) throw new Error('Invalid EXIF pointer')
      const offset = pointer(entry)
      if (visited.has(offset)) throw new Error('Cyclic EXIF directory')
      visited.add(offset)
      validateChildren(readIfd(offset), depth + 1)
    }
  }
  validateChildren(root, 0)
  return { view, little, root, exif, pointer }
}

/** First EXIF block from JPEG, PNG or WebP. Unsupported/malformed metadata is ignored. */
export function extractSourceExif(bytes: Uint8Array): Uint8Array | undefined {
  let payload: Uint8Array | undefined
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      let pos = 2
      while (pos + 4 <= bytes.length) {
        if (bytes[pos++] !== 0xff) return undefined
        while (bytes[pos] === 0xff) pos++
        const marker = bytes[pos++]
        if (marker === 0xda || marker === 0xd9) break
        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
        const size = view.getUint16(pos)
        if (size < 2 || pos + size > bytes.length) return undefined
        if (marker === 0xe1 && ascii(bytes, pos + 2, 6) === 'Exif\0\0') {
          payload = bytes.subarray(pos + 8, pos + size)
          break
        }
        pos += size
      }
    } else if (ascii(bytes, 0, 8) === '\x89PNG\r\n\x1a\n') {
      for (let pos = 8; pos + 12 <= bytes.length;) {
        const size = view.getUint32(pos)
        if (pos + 12 + size > bytes.length) return undefined
        if (ascii(bytes, pos + 4, 4) === 'eXIf') {
          payload = bytes.subarray(pos + 8, pos + 8 + size)
          break
        }
        pos += 12 + size
      }
    } else if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
      const end = view.getUint32(4, true) + 8
      if (end > bytes.length) return undefined
      for (let pos = 12; pos + 8 <= end;) {
        const size = view.getUint32(pos + 4, true)
        if (pos + 8 + size > end) return undefined
        if (ascii(bytes, pos, 4) === 'EXIF') {
          const start = pos + 8 + (ascii(bytes, pos + 8, 6) === 'Exif\0\0' ? 6 : 0)
          payload = bytes.subarray(start, pos + 8 + size)
          break
        }
        pos += 8 + size + (size % 2)
      }
    }
    if (!payload || payload.length > maxExifBytes) return undefined
    tiff(payload)
    return payload.slice()
  } catch {
    return undefined
  }
}

/** Merge capture metadata with the encoder's current Apple HDR MakerNote. */
export function mergeSourceExif(source: Uint8Array, generated: Uint8Array, width: number, height: number) {
  const original = tiff(source)
  const current = tiff(generated)
  const maker = current.exif.find((entry) => entry.tag === 0x927c)
  if (!maker) throw new Error('Encoder EXIF has no Apple HDR MakerNote')
  const makerSize = new DataView(maker.raw.buffer).getUint32(4, current.little)
  const makerOffset = current.pointer(maker)
  if (makerSize <= 4 || makerOffset + makerSize > generated.length) throw new Error('Invalid Apple HDR MakerNote')

  const { little } = original
  const software = new TextEncoder().encode('LumaHEIC\0')
  const softwareOffset = source.length + (source.length % 2)
  const makerNewOffset = softwareOffset + software.length + (software.length % 2)
  const exifOffset = makerNewOffset + makerSize + (makerSize % 2)
  const entry = (tag: number, type: number, count: number, value: number): Entry => {
    const raw = new Uint8Array(12)
    const v = new DataView(raw.buffer)
    v.setUint16(0, tag, little); v.setUint16(2, type, little); v.setUint32(4, count, little)
    if (type === 3 && count === 1) v.setUint16(8, value, little)
    else v.setUint32(8, value, little)
    return { tag, raw }
  }
  const exif = original.exif.filter((e) => ![0x927c, 0xa001, 0xa002, 0xa003].includes(e.tag))
  exif.push(entry(0x927c, 7, makerSize, makerNewOffset), entry(0xa001, 3, 1, 65535),
    entry(0xa002, 4, 1, width), entry(0xa003, 4, 1, height))
  const rootOffset = exifOffset + 2 + exif.length * 12 + 4
  // Drop source storage/thumbnail links; the rendered pixels have new dimensions
  // and browser decoding has already applied EXIF orientation.
  const root = original.root.filter((e) => ![
    0x100, 0x101, 0x103, 0x111, 0x112, 0x116, 0x117, 0x131,
    0x144, 0x145, 0x14a, 0x201, 0x202, 0x8769,
  ].includes(e.tag))
  root.push(entry(0x100, 4, 1, width), entry(0x101, 4, 1, height), entry(0x112, 3, 1, 1),
    entry(0x131, 2, software.length, softwareOffset), entry(0x8769, 4, 1, exifOffset))
  const output = new Uint8Array(rootOffset + 2 + root.length * 12 + 4)
  output.set(source)
  output.set(software, softwareOffset)
  output.set(generated.subarray(makerOffset, makerOffset + makerSize), makerNewOffset)
  const view = new DataView(output.buffer)
  const writeIfd = (offset: number, entries: Entry[]) => {
    entries.sort((a, b) => a.tag - b.tag)
    view.setUint16(offset, entries.length, little)
    entries.forEach((e, i) => output.set(e.raw, offset + 2 + i * 12))
    // New directories intentionally have no IFD1 (stale preview thumbnail).
  }
  writeIfd(exifOffset, exif)
  writeIfd(rootOffset, root)
  view.setUint32(4, rootOffset, little)
  return output
}
