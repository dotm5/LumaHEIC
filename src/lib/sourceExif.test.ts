// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { extractSourceExif, mergeSourceExif } from './sourceExif'
import { preserveSourceExif } from './heicExif'

// Independent fixture with camera, capture time, lens, GPS, and an IFD1 thumbnail.
function sourceExif(little: boolean) {
  const bytes = new Uint8Array(512)
  const v = new DataView(bytes.buffer)
  bytes.set(new TextEncoder().encode(little ? 'II' : 'MM'))
  v.setUint16(2, 42, little); v.setUint32(4, 8, little)
  const put = (pos: number, tag: number, type: number, count: number, value: number) => {
    v.setUint16(pos, tag, little); v.setUint16(pos + 2, type, little); v.setUint32(pos + 4, count, little)
    if (type === 3) v.setUint16(pos + 8, value, little)
    else v.setUint32(pos + 8, value, little)
  }
  v.setUint16(8, 5, little)
  put(10, 0x010f, 2, 6, 300) // Make
  put(22, 0x0112, 3, 1, 6) // already rotated by browser
  put(34, 0x8769, 4, 1, 100)
  put(46, 0x8825, 4, 1, 200)
  put(58, 0x013b, 2, 7, 320) // Artist
  v.setUint32(70, 400, little)
  v.setUint16(100, 3, little)
  put(102, 0x9003, 2, 20, 340)
  put(114, 0xa434, 2, 8, 370)
  put(126, 0x927c, 7, 8, 380) // stale source MakerNote
  v.setUint16(200, 1, little)
  put(202, 2, 5, 3, 240)
  v.setUint32(240, 31, little); v.setUint32(244, 1, little)
  v.setUint32(248, 12, little); v.setUint32(252, 1, little)
  v.setUint32(256, 30, little); v.setUint32(260, 1, little)
  for (const [offset, text] of [[300, 'Canon\0'], [320, 'Author\0'], [340, '2026:10:13 11:46:46\0'], [370, '50mm f2\0'], [380, 'OLDNOTE\0']] as const) {
    bytes.set(new TextEncoder().encode(text), offset)
  }
  v.setUint16(400, 0, little)
  return bytes
}

function entries(bytes: Uint8Array, offset?: number) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const le = bytes[0] === 0x49
  offset ??= v.getUint32(4, le)
  return new Map(Array.from({ length: v.getUint16(offset, le) }, (_, i) => {
    const pos = offset! + 2 + i * 12
    return [v.getUint16(pos, le), { pos, value: v.getUint32(pos + 8, le), short: v.getUint16(pos + 8, le) }] as const
  }))
}

function wrap(bytes: Uint8Array, format: 'jpeg' | 'png' | 'webp') {
  const extra = format === 'jpeg' ? 12 : format === 'png' ? 20 : 20
  const output = new Uint8Array(bytes.length + extra)
  const v = new DataView(output.buffer)
  if (format === 'jpeg') {
    output.set([0xff, 0xd8, 0xff, 0xe1]); v.setUint16(4, bytes.length + 8)
    output.set(new TextEncoder().encode('Exif\0\0'), 6); output.set(bytes, 12)
  } else if (format === 'png') {
    output.set([137, 80, 78, 71, 13, 10, 26, 10]); v.setUint32(8, bytes.length)
    output.set(new TextEncoder().encode('eXIf'), 12); output.set(bytes, 16)
  } else {
    output.set(new TextEncoder().encode('RIFF')); v.setUint32(4, output.length - 8, true)
    output.set(new TextEncoder().encode('WEBPEXIF'), 8); v.setUint32(16, bytes.length, true); output.set(bytes, 20)
  }
  return output
}

// Exercise the checked-in WASM, not a mock or a second encoder implementation.
async function encode() {
  const url = new URL('../../public/encoders/apple-hdr-heic.js', import.meta.url).href
  const { default: create } = await import(/* @vite-ignore */ url)
  const m = await create({ wasmBinary: readFileSync(new URL('../../public/encoders/apple-hdr-heic.wasm', import.meta.url)) })
  const b = m._malloc(64 * 64 * 4), g = m._malloc(32 * 32), p = m._malloc(4), n = m._malloc(4)
  let out = 0
  try {
    m.HEAPU8.fill(128, b, b + 64 * 64 * 4); m.HEAPU8.fill(128, g, g + 32 * 32)
    const status = m.ccall('encode_apple_hdr_heic', 'number', Array(11).fill('number'), [b, 64, 64, g, 32, 32, 80, 4, p, n, 0])
    expect(status).toBe(0)
    const view = new DataView(m.HEAPU8.buffer)
    out = view.getUint32(p, true)
    return m.HEAPU8.slice(out, out + view.getUint32(n, true)) as Uint8Array
  } finally {
    if (out) m.ccall('free_encoded_buffer', 'number', ['number'], [out])
    for (const ptr of [b, g, p, n]) m._free(ptr)
  }
}

function heicExif(heic: Uint8Array) {
  const v = new DataView(heic.buffer, heic.byteOffset, heic.byteLength)
  // Independent item lookup for this encoder's iloc v0 layout (Exif item ID 3).
  const iloc = heic.findIndex((_, i) => String.fromCharCode(...heic.subarray(i, i + 4)) === 'iloc') - 4
  for (let pos = iloc + 16; pos < iloc + v.getUint32(iloc);) {
    const count = v.getUint16(pos + 8)
    if (v.getUint16(pos) === 3) {
      const offset = v.getUint32(pos + 4) + v.getUint32(pos + 10)
      return heic.slice(offset + 4 + v.getUint32(offset), offset + v.getUint32(pos + 14))
    }
    pos += 10 + count * 8
  }
  throw new Error('No EXIF')
}

describe('source EXIF preservation', () => {
  for (const little of [true, false]) {
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      it(`extracts ${little ? 'little' : 'big'} endian EXIF from ${format}`, () => {
        expect(extractSourceExif(wrap(sourceExif(little), format))).toEqual(sourceExif(little))
      })
    }
  }
  it('ignores absent, truncated, oversized and cyclic metadata', () => {
    expect(extractSourceExif(new Uint8Array(8))).toBeUndefined()
    const good = wrap(sourceExif(true), 'jpeg')
    expect(extractSourceExif(good.slice(0, -1))).toBeUndefined()
    const bad = sourceExif(true)
    new DataView(bad.buffer).setUint32(42, 8, true)
    expect(extractSourceExif(wrap(bad, 'png'))).toBeUndefined()
    const oversized = new Uint8Array(1024 * 1024 + 1)
    oversized.set(sourceExif(true))
    expect(extractSourceExif(wrap(oversized, 'png'))).toBeUndefined()
  })
  it('round-trips metadata through real WASM output and retains current HDR data', async () => {
    const original = await encode()
    const generated = heicExif(original)
    for (const little of [true, false]) {
      const source = sourceExif(little)
      const patched = preserveSourceExif(original, source, 64, 64)
      const merged = heicExif(patched)
      const root = entries(merged)
      const exif = entries(merged, root.get(0x8769)!.value)
      const text = (offset: number, count: number) => new TextDecoder().decode(merged.subarray(offset, offset + count))
      expect(text(root.get(0x010f)!.value, 6)).toBe('Canon\0')
      expect(text(root.get(0x013b)!.value, 7)).toBe('Author\0')
      expect(text(exif.get(0x9003)!.value, 20)).toBe('2026:10:13 11:46:46\0')
      expect(text(exif.get(0xa434)!.value, 8)).toBe('50mm f2\0')
      expect(root.get(0x0112)!.short).toBe(1)
      expect(root.get(0x0100)!.value).toBe(64)
      expect(exif.get(0xa003)!.value).toBe(64)
      expect(root.get(0x8825)!.value).toBe(200)
      expect(merged.subarray(200, 264)).toEqual(source.subarray(200, 264))
      const genMaker = entries(generated, entries(generated).get(0x8769)!.value).get(0x927c)!.value
      expect(merged.subarray(exif.get(0x927c)!.value, exif.get(0x927c)!.value + 60)).toEqual(generated.subarray(genMaker, genMaker + 60))
      const v = new DataView(merged.buffer)
      const rootOffset = v.getUint32(4, little)
      expect(v.getUint32(rootOffset + 2 + root.size * 12, little)).toBe(0)
      expect(source).toEqual(sourceExif(little)) // no mutation
      // Existing file differs only at the selected EXIF item's location fields.
      const changed = [...original.keys()].filter((i) => original[i] !== patched[i])
      expect(changed.length).toBeLessThanOrEqual(12)
      expect(merged).toEqual(mergeSourceExif(source, generated, 64, 64))
    }
    expect(() => preserveSourceExif(new Uint8Array(8), sourceExif(true), 64, 64)).toThrow()
  })
})
