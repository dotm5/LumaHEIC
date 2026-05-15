import type { HeicEncodeRequest, HeicEncodeResult } from '../lib/encoderTypes'

type NativeModule = {
  _malloc(size: number): number
  _free(ptr: number): void
  HEAPU8: Uint8Array
  ccall(name: string, returnType: string, argTypes: string[], args: unknown[]): number
}

let nativeModulePromise: Promise<NativeModule | null> | null = null

export async function encodeAppleHdrHeic(request: HeicEncodeRequest): Promise<HeicEncodeResult> {
  const nativeModule = await loadNativeEncoder().catch((error) => {
    throw new Error(`Browser HEIC encoder is not available: ${errorMessage(error)}`)
  })
  if (!nativeModule) {
    throw new Error('Browser HEIC encoder is not available')
  }
  return encodeWithNativeModule(nativeModule, request)
}

async function loadNativeEncoder() {
  nativeModulePromise ??= import(
    /* @vite-ignore */ `${self.location.origin}${import.meta.env.BASE_URL}encoders/apple-hdr-heic.js`
  ).then(async (mod: { default?: (opts: object) => Promise<NativeModule> }) => {
    if (!mod.default) return null
    return mod.default({
      locateFile: (path: string) => `${import.meta.env.BASE_URL}encoders/${path}`,
    })
  })

  return nativeModulePromise
}

function encodeWithNativeModule(module: NativeModule, request: HeicEncodeRequest): HeicEncodeResult {
  const { result, options, quality } = request
  const basePtr = copyIntoHeap(module, result.base.data)
  const gainPtr = copyIntoHeap(module, result.gainMap.data)
  const outPtrPtr = module._malloc(4)
  const outLenPtr = module._malloc(4)

  try {
    const status = module.ccall(
      'encode_apple_hdr_heic',
      'number',
      [
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
        'number',
      ],
      [
        basePtr,
        result.base.width,
        result.base.height,
        gainPtr,
        result.gainMap.width,
        result.gainMap.height,
        quality,
        options.headroom,
        outPtrPtr,
        outLenPtr,
        0,
      ],
    )

    if (status !== 0) {
      throw new Error(`WASM HEIC encoding failed: ${nativeEncoderStatusMessage(status)}`)
    }

    const view = new DataView(module.HEAPU8.buffer)
    const outPtr = view.getUint32(outPtrPtr, true)
    const outLen = view.getUint32(outLenPtr, true)
    const bytes = module.HEAPU8.slice(outPtr, outPtr + outLen)
    module.ccall('free_encoded_buffer', 'number', ['number'], [outPtr])

    return {
      kind: 'heic',
      fileName: withExtension(request.sourceName, '.heic'),
      mimeType: 'image/heic',
      bytes,
      message: 'Encoded Apple HDR gain map HEIC locally in your browser.',
    }
  } finally {
    module._free(basePtr)
    module._free(gainPtr)
    module._free(outPtrPtr)
    module._free(outLenPtr)
  }
}

function copyIntoHeap(module: NativeModule, bytes: Uint8Array | Uint8ClampedArray) {
  const ptr = module._malloc(bytes.byteLength)
  module.HEAPU8.set(bytes, ptr)
  return ptr
}

function nativeEncoderStatusMessage(status: number) {
  const messages: Record<number, string> = {
    1: 'invalid image buffer or dimensions',
    2: 'HEVC encoder is unavailable in the WASM module',
    3: 'could not create the primary image',
    4: 'could not allocate the primary RGB plane',
    5: 'could not fill the primary RGB image',
    6: 'could not encode the primary image',
    7: 'could not mark the primary image item',
    8: 'could not create the gain map image',
    9: 'could not allocate the gain map luma plane',
    10: 'could not fill the gain map image',
    11: 'could not encode the gain map image',
    12: 'could not add the Apple HDR auxC property',
    13: 'could not add the auxl item reference between gain map and primary image',
    14: 'could not add Apple HDR gain map XMP metadata',
    15: 'could not write the HEIC container',
    16: 'could not allocate the encoded output buffer',
    17: 'could not set x265 preset',
    18: 'could not set x265 tune',
    19: 'could not disable x265 worker pools',
    20: 'could not force single-frame x265 encoding',
    21: 'could not disable x265 wavefront parallel processing',
    22: 'could not disable x265 pmode',
    23: 'could not disable x265 pme',
    24: 'could not disable x265 threaded motion estimation',
    25: 'could not disable x265 lookahead slices',
    26: 'could not disable x265 lookahead threads',
    27: 'could not disable x265 lookahead',
    28: 'could not disable x265 B-frames',
    29: 'could not disable x265 B-frame adaptation',
    30: 'could not add Apple MakerNote EXIF metadata',
  }
  return messages[status] ?? `native encoder returned status ${status}`
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function withExtension(name: string, ext: string) {
  const cleanName = name || 'bypass-hdr'
  const dot = cleanName.lastIndexOf('.')
  const stem = dot > 0 ? cleanName.slice(0, dot) : cleanName
  return `${stem}${ext}`
}
