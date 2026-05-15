import { encodeAppleHdrHeic } from '../encoders/appleHeicEncoder'
import type { BypassOptions, RgbaImage } from '../lib/gainMap'
import { generateBypassGainMap } from '../lib/gainMap'

type WorkerScope = {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage(message: unknown, transfer?: Transferable[]): void
}

const scope = self as unknown as WorkerScope

type ProcessRequest = {
  type: 'process'
  id: number
  sourceName: string
  image: RgbaImage
  options: BypassOptions
  quality: number
  encode: boolean
}

type WorkerRequest = ProcessRequest

function postProgress(id: number, message: string) {
  scope.postMessage({ type: 'progress', id, message })
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  if (request.type !== 'process') return

  try {
    postProgress(request.id, 'Generating Apple-style gain map')
    const result = generateBypassGainMap(request.image, request.options)

    if (!request.encode) {
      scope.postMessage(
        {
          type: 'processed',
          id: request.id,
          result,
        },
        [
          result.base.data.buffer as ArrayBuffer,
          result.gainMap.data.buffer as ArrayBuffer,
          result.gainMapPreview.data.buffer as ArrayBuffer,
          result.hdrPreview.data.buffer as ArrayBuffer,
        ] satisfies Transferable[],
      )
      return
    }

    postProgress(request.id, 'Encoding HEIC payload')
    const encoded = await encodeAppleHdrHeic({
      sourceName: request.sourceName,
      result,
      options: request.options,
      quality: request.quality,
    })

    scope.postMessage(
      {
        type: 'encoded',
        id: request.id,
        result,
        encoded,
      },
      [
        result.base.data.buffer as ArrayBuffer,
        result.gainMap.data.buffer as ArrayBuffer,
        result.gainMapPreview.data.buffer as ArrayBuffer,
        result.hdrPreview.data.buffer as ArrayBuffer,
        encoded.bytes.buffer as ArrayBuffer,
      ] satisfies Transferable[],
    )
  } catch (error) {
    scope.postMessage({
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
