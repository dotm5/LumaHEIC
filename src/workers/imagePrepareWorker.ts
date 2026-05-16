import { previewProcessMaxLongEdge } from '../features/preview/constants'
import { downsampleRgbaImage } from '../features/preview/downsampleRgba'
import { detectUsefulGain } from '../lib/gainMap'
import {
  serializeImagePrepareError,
  type ImagePrepareRequest,
} from './imagePrepareProtocol'

type WorkerScope = {
  onmessage: ((event: MessageEvent<ImagePrepareRequest>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}

const scope = self as unknown as WorkerScope

scope.onmessage = (event: MessageEvent<ImagePrepareRequest>) => {
  const request = event.data
  if (request.type !== 'prepare-image') return

  try {
    const previewImage = downsampleRgbaImage(request.image, previewProcessMaxLongEdge)
    const usefulGain = request.detectUsefulGain ? detectUsefulGain(request.image) : undefined
    scope.postMessage(
      {
        type: 'prepared-image',
        id: request.id,
        previewImage,
        usefulGain,
      },
      [previewImage.data.buffer as ArrayBuffer] satisfies Transferable[],
    )
  } catch (error) {
    scope.postMessage(serializeImagePrepareError(request.id, error))
  }
}
