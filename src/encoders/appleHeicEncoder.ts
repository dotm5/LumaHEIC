import { createDebugPackage } from '../lib/debugPackage'
import type { HeicEncodeRequest, HeicEncodeResult } from '../lib/encoderTypes'
import { encodeWithBackend } from './backendHeicEncoder'

type NativeModule = {
  _malloc(size: number): number
  _free(ptr: number): void
  HEAPU8: Uint8Array
  ccall(name: string, returnType: string, argTypes: string[], args: unknown[]): number
}

let nativeModulePromise: Promise<NativeModule | null> | null = null

export async function encodeAppleHdrHeic(request: HeicEncodeRequest): Promise<HeicEncodeResult> {
  if (import.meta.env.VITE_HEIC_ENCODER_MODE !== 'backend') {
    const nativeModule = await loadNativeEncoder()
    if (nativeModule) {
      try {
        return encodeWithNativeModule(nativeModule, request)
      } catch (error) {
        console.warn('Native browser HEIC encoder failed, trying backend encoder.', error)
      }
    }
  }

  try {
    const backendResult = await encodeWithBackend(request)
    if (backendResult) return backendResult
  } catch (error) {
    console.warn('Backend HEIC encoder failed, falling back to debug package.', error)
  }

  return debugPackageResult(request)
}

async function loadNativeEncoder() {
  nativeModulePromise ??= import(/* @vite-ignore */ `${self.location.origin}${import.meta.env.BASE_URL}encoders/apple-hdr-heic.js`)
    .then(async (mod: { default?: (opts: object) => Promise<NativeModule> }) => {
      if (!mod.default) return null
      return mod.default({
        locateFile: (path: string) => `${import.meta.env.BASE_URL}encoders/${path}`,
      })
    })
    .catch(() => null)

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
      throw new Error(`Native encoder returned ${status}.`)
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
      message: 'Encoded Apple HDR gain map HEIC with the native libheif+x265 backend.',
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

async function debugPackageResult(request: HeicEncodeRequest): Promise<HeicEncodeResult> {
  const blob = createDebugPackage(request)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  return {
    kind: 'debug-json',
    fileName: withExtension(request.sourceName, '.gainmap.json'),
    mimeType: 'application/json',
    bytes,
    message:
      'Native libheif+x265 WASM encoder was not found. Exported a debug package with base RGBA, Apple-style gain map, and metadata.',
  }
}

function withExtension(name: string, ext: string) {
  const cleanName = name || 'bypass-hdr'
  const dot = cleanName.lastIndexOf('.')
  const stem = dot > 0 ? cleanName.slice(0, dot) : cleanName
  return `${stem}${ext}`
}
