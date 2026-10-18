import { captureXmpDescription, mergeSourceExif } from './sourceExif'

/** Update EXIF and synchronize capture XMP; image items, auxl and HDR values stay intact. */
export function preserveSourceExif(heic: Uint8Array, source: Uint8Array, width: number, height: number) {
  const view = new DataView(heic.buffer, heic.byteOffset, heic.byteLength)
  const u16 = (pos: number) => view.getUint16(pos)
  const u32 = (pos: number) => view.getUint32(pos)
  const name = (pos: number) => String.fromCharCode(...heic.subarray(pos, pos + 4))
  const boxes = (start: number, end: number) => {
    const result: { start: number; end: number; type: string }[] = []
    while (start < end) {
      if (start + 8 > end) throw new Error('Truncated HEIC box')
      const size = u32(start)
      // The bundled encoder writes ordinary 32-bit boxes, not large-size boxes.
      if (size < 8 || start + size > end) throw new Error('Unsupported HEIC box size')
      result.push({ start, end: start + size, type: name(start + 4) })
      start += size
    }
    return result
  }
  const meta = boxes(0, heic.length).find((box) => box.type === 'meta')
  if (!meta || heic[meta.start + 8] !== 0) throw new Error('Unsupported HEIC metadata')
  const children = boxes(meta.start + 12, meta.end)
  const iinf = children.find((box) => box.type === 'iinf')
  const iloc = children.find((box) => box.type === 'iloc')
  if (!iinf || !iloc) throw new Error('Missing HEIC item metadata')
  const infoVersion = heic[iinf.start + 8]
  if (infoVersion !== 0) throw new Error('Unsupported HEIC item info version')
  const info = boxes(iinf.start + 14, iinf.end)
  const exifInfo = info.find((box) => box.type === 'infe' && heic[box.start + 8] === 2 && name(box.start + 16) === 'Exif')
  if (!exifInfo) throw new Error('Missing encoder EXIF item')
  const exifId = u16(exifInfo.start + 12)
  const xmpInfo = info.find((box) => box.type === 'infe' && heic[box.start + 8] === 2
    && name(box.start + 16) === 'mime'
    && new TextDecoder().decode(heic.subarray(box.start + 20, box.end)).includes('application/rdf+xml\0'))
  if (!xmpInfo) throw new Error('Missing encoder XMP item')
  const xmpId = u16(xmpInfo.start + 12)
  const replacements: { pos: number; payload: Uint8Array }[] = []
  // Match the bundled libheif ABI/container layout explicitly; fail visibly if a
  // future encoder changes it instead of silently dropping the original EXIF.
  if (heic[iloc.start + 8] !== 0 || heic[iloc.start + 12] !== 0x44 || heic[iloc.start + 13] !== 0x40) {
    throw new Error('Unsupported HEIC item location layout')
  }
  const count = u16(iloc.start + 14)
  let pos = iloc.start + 16
  for (let i = 0; i < count; i++) {
    if (pos + 10 > iloc.end) throw new Error('Truncated HEIC location')
    const id = u16(pos)
    const base = u32(pos + 4)
    const extents = u16(pos + 8)
    const next = pos + 10 + extents * 8
    if (next > iloc.end) throw new Error('Truncated HEIC extents')
    if (id === exifId || id === xmpId) {
      if (u16(pos + 2) !== 0 || extents !== 1) throw new Error('Unsupported HEIC EXIF extent')
      const offset = base + u32(pos + 10)
      const length = u32(pos + 14)
      if (offset + length > heic.length) throw new Error('Invalid HEIC metadata extent')
      let payload: Uint8Array
      if (id === exifId) {
        if (length < 12) throw new Error('Invalid HEIC EXIF extent')
        const tiffOffset = offset + 4 + u32(offset)
        if (tiffOffset + 8 > offset + length) throw new Error('Invalid HEIC TIFF offset')
        const exif = mergeSourceExif(source, heic.subarray(tiffOffset, offset + length), width, height)
        payload = new Uint8Array(exif.length + 4)
        payload.set(exif, 4)
      } else {
        const xml = new TextDecoder().decode(heic.subarray(offset, offset + length))
        const end = xml.indexOf('</rdf:RDF>')
        if (end < 0) throw new Error('Unsupported encoder XMP layout')
        payload = new TextEncoder().encode(xml.slice(0, end) + captureXmpDescription(source, width, height) + xml.slice(end))
      }
      replacements.push({ pos, payload })
    }
    pos = next
  }
  if (replacements.length !== 2) throw new Error('Missing HEIC metadata location')
  const output = new Uint8Array(heic.length + replacements.reduce((size, entry) => size + 8 + entry.payload.length, 0))
  output.set(heic)
  const outView = new DataView(output.buffer)
  let end = heic.length
  // Appended mdats keep every existing image item offset stable.
  for (const { pos, payload } of replacements) {
    outView.setUint32(end, payload.length + 8)
    output.set(new TextEncoder().encode('mdat'), end + 4)
    output.set(payload, end + 8)
    outView.setUint32(pos + 4, end + 8)
    outView.setUint32(pos + 10, 0)
    outView.setUint32(pos + 14, payload.length)
    end += payload.length + 8
  }
  return output
}
