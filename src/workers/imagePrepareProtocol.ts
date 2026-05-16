import type { RgbaImage } from '../lib/gainMap'

export type ImagePrepareRequest = {
  type: 'prepare-image'
  id: number
  image: RgbaImage
  detectUsefulGain: boolean
}

export type ImagePrepareResponse = {
  type: 'prepared-image'
  id: number
  previewImage: RgbaImage
  usefulGain?: {
    maxLuminance: number
    meanLuminance: number
    isLowDynamicRange: boolean
  }
}

export type ImagePrepareErrorResponse = {
  type: 'error'
  id: number
  message: string
}

export type ImagePrepareWorkerResponse = ImagePrepareResponse | ImagePrepareErrorResponse

export function serializeImagePrepareError(id: number, error: unknown): ImagePrepareErrorResponse {
  return {
    type: 'error',
    id,
    message: error instanceof Error ? error.message : String(error),
  }
}
