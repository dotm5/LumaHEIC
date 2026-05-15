import type { BypassOptions, GainMapResult } from './gainMap'

export type HeicEncodeRequest = {
  sourceName: string
  result: GainMapResult
  options: BypassOptions
  quality: number
}

export type HeicEncodeResult =
  | {
      kind: 'heic'
      fileName: string
      mimeType: 'image/heic'
      bytes: Uint8Array
      message: string
    }
  | {
      kind: 'debug-json'
      fileName: string
      mimeType: 'application/json'
      bytes: Uint8Array
      message: string
    }
