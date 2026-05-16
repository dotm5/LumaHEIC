import type { RgbaImage } from '../lib/gainMap'
import type { ImagePrepareRequest, ImagePrepareWorkerResponse } from './imagePrepareProtocol'

let nextPrepareRequestId = 1

type PrepareImageOptions = {
  detectUsefulGain?: boolean
  signal?: AbortSignal
}

export function prepareImageInWorker(image: RgbaImage, options: PrepareImageOptions = {}) {
  const id = nextPrepareRequestId++
  const worker = new Worker(new URL('./imagePrepareWorker.ts', import.meta.url), {
    type: 'module',
  })

  return new Promise<Extract<ImagePrepareWorkerResponse, { type: 'prepared-image' }>>((resolve, reject) => {
    const cleanup = () => {
      worker.onmessage = null
      worker.terminate()
      options.signal?.removeEventListener('abort', abort)
    }
    const abort = () => {
      cleanup()
      reject(new DOMException('Image preparation was cancelled.', 'AbortError'))
    }

    if (options.signal?.aborted) {
      abort()
      return
    }

    options.signal?.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<ImagePrepareWorkerResponse>) => {
      const response = event.data
      if (response.id !== id) return
      cleanup()
      if (response.type === 'error') {
        reject(new Error(response.message))
        return
      }
      resolve(response)
    }

    const request: ImagePrepareRequest = {
      type: 'prepare-image',
      id,
      image: {
        width: image.width,
        height: image.height,
        data: new Uint8ClampedArray(image.data),
      },
      detectUsefulGain: options.detectUsefulGain ?? false,
    }
    worker.postMessage(request, [request.image.data.buffer as ArrayBuffer])
  })
}
