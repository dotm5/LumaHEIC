// Metadata-only ISO BMFF reader. No image bitstream is parsed or decoded here.
const maxExifBytes = 1024 * 1024

type Box = { type: string; data: number; end: number }

/** Exif item bytes, assembled in extent order from file (method 0) or idat (method 1). */
export function extractBmffExif(bytes: Uint8Array): Uint8Array | undefined {
  const ascii = (pos: number, count: number) => String.fromCharCode(...bytes.subarray(pos, pos + count))
  const integer = (pos: number, size: number, end: number) => {
    if (![0, 1, 2, 4, 8].includes(size) || pos < 0 || pos + size > end) throw new Error('Invalid BMFF integer')
    let value = 0
    for (let i = 0; i < size; i++) value = value * 256 + bytes[pos + i]
    if (!Number.isSafeInteger(value)) throw new Error('Unsafe BMFF offset')
    return value
  }
  const boxes = (start: number, end: number): Box[] => {
    const result: Box[] = []
    while (start < end) {
      if (result.length >= 16384) throw new Error('Too many BMFF boxes')
      const size32 = integer(start, 4, end)
      if (start + 8 > end) throw new Error('Truncated BMFF box')
      const header = size32 === 1 ? 16 : 8
      const size = size32 === 0 ? end - start : size32 === 1 ? integer(start + 8, 8, end) : size32
      if (size < header || size > end - start) throw new Error('Invalid BMFF box size')
      result.push({ type: ascii(start + 4, 4), data: start + header, end: start + size })
      start += size
    }
    return result
  }
  const top = boxes(0, bytes.length)
  const ftyp = top.find((box) => box.type === 'ftyp')
  if (!ftyp || ftyp.end - ftyp.data < 8) return undefined
  const brands = [ascii(ftyp.data, 4)]
  for (let pos = ftyp.data + 8; pos + 4 <= ftyp.end; pos += 4) brands.push(ascii(pos, 4))
  if (!brands.some((brand) => brand === 'avif' || brand === 'avis')) return undefined
  const meta = top.find((box) => box.type === 'meta')
  if (!meta || integer(meta.data, 4, meta.end) !== 0) return undefined
  const children = boxes(meta.data + 4, meta.end)
  const iinf = children.find((box) => box.type === 'iinf')
  const iloc = children.find((box) => box.type === 'iloc')
  const idat = children.find((box) => box.type === 'idat')
  if (!iinf || !iloc) return undefined
  const infoVersion = integer(iinf.data, 1, iinf.end)
  if (infoVersion > 1) return undefined
  const countSize = infoVersion === 0 ? 2 : 4
  const itemInfos = boxes(iinf.data + 4 + countSize, iinf.end)
  if (integer(iinf.data + 4, countSize, iinf.end) !== itemInfos.length) throw new Error('Invalid iinf count')
  const exifIds = new Set<number>()
  for (const info of itemInfos) {
    if (info.type !== 'infe') continue
    const version = integer(info.data, 1, info.end)
    if (version !== 2 && version !== 3) continue
    const idSize = version === 2 ? 2 : 4
    if (info.data + 4 + idSize + 6 > info.end) throw new Error('Truncated infe')
    const id = integer(info.data + 4, idSize, info.end)
    const protection = integer(info.data + 4 + idSize, 2, info.end)
    if (protection === 0 && ascii(info.data + 6 + idSize, 4) === 'Exif') exifIds.add(id)
  }
  if (!exifIds.size) return undefined
  const version = integer(iloc.data, 1, iloc.end)
  if (version > 2) return undefined
  const sizes = integer(iloc.data + 4, 2, iloc.end)
  const offsetSize = (sizes >> 12) & 15
  const lengthSize = (sizes >> 8) & 15
  const baseSize = (sizes >> 4) & 15
  const indexSize = version > 0 ? sizes & 15 : 0
  for (const size of [offsetSize, lengthSize, baseSize, indexSize]) {
    if (![0, 1, 2, 4, 8].includes(size)) throw new Error('Unsupported iloc integer width')
  }
  let pos = iloc.data + 6
  const take = (size: number) => {
    const value = integer(pos, size, iloc.end)
    pos += size
    return value
  }
  const itemCount = take(version < 2 ? 2 : 4)
  if (itemCount > 65536) throw new Error('Too many iloc items')
  for (let i = 0; i < itemCount; i++) {
    const id = take(version < 2 ? 2 : 4)
    const method = version > 0 ? take(2) & 15 : 0
    const reference = take(2)
    const base = take(baseSize)
    const count = take(2)
    const wanted = exifIds.has(id)
    const parts: Uint8Array[] = []
    let total = 0
    for (let j = 0; j < count; j++) {
      take(indexSize)
      const offset = take(offsetSize)
      const length = take(lengthSize)
      if (!wanted) continue
      if (reference !== 0 || (method !== 0 && method !== 1) || (method === 1 && !idat) || length === 0) {
        throw new Error('Unsupported EXIF item storage')
      }
      const start = (method === 1 ? idat!.data : 0) + base + offset
      const end = method === 1 ? idat!.end : bytes.length
      if (!Number.isSafeInteger(start) || start < 0 || length > end - start) throw new Error('EXIF extent out of bounds')
      total += length
      if (total > maxExifBytes + 4 + 65536) throw new Error('Oversized EXIF item')
      parts.push(bytes.subarray(start, start + length))
    }
    if (!wanted) continue
    if (total < 12) throw new Error('Truncated EXIF item')
    const payload = new Uint8Array(total)
    let cursor = 0
    for (const part of parts) { payload.set(part, cursor); cursor += part.length }
    // The uint32 is an offset relative to the byte AFTER this field. It can
    // skip an Exif\0\0 prefix/padding; it is not always simply four bytes.
    const tiffStart = 4 + new DataView(payload.buffer).getUint32(0)
    if (tiffStart > payload.length - 8 || payload.length - tiffStart > maxExifBytes) throw new Error('Invalid EXIF TIFF offset')
    return payload.slice(tiffStart)
  }
  return undefined
}
