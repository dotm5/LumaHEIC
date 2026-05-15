import type { HeicEncodeRequest, HeicEncodeResult } from '../lib/encoderTypes'

type BackendHeader = {
  sourceName: string
  width: number
  height: number
  gainWidth: number
  gainHeight: number
  quality: number
  headroom: number
  baseLength: number
  gainLength: number
}

const kBackendMime = 'application/vnd.hdr-heic-bypass.encode+binary'

export async function encodeWithBackend(request: HeicEncodeRequest): Promise<HeicEncodeResult | null> {
  const endpoint = getBackendEndpoint()
  if (!endpoint) return null

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': kBackendMime,
    },
    body: buildBackendPayload(request),
  })

  if (response.status === 404 || response.status === 405) {
    return null
  }

  if (!response.ok) {
    const message = await response.text().catch(() => '')
    throw new Error(message || `Backend encoder returned HTTP ${response.status}.`)
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  return {
    kind: 'heic',
    fileName: getResponseFileName(response) ?? withExtension(request.sourceName, '.heic'),
    mimeType: 'image/heic',
    bytes,
    message: 'Encoded Apple HDR gain map HEIC with the backend WASM libheif+x265 encoder.',
  }
}

function getBackendEndpoint() {
  const configured = import.meta.env.VITE_HEIC_BACKEND_URL
  if (configured) return configured
  if (self.location.protocol === 'file:') return null

  return new URL('api/encode-heic', `${self.location.origin}${import.meta.env.BASE_URL}`).toString()
}

function buildBackendPayload(request: HeicEncodeRequest) {
  const { result, options, quality } = request
  const header: BackendHeader = {
    sourceName: request.sourceName,
    width: result.base.width,
    height: result.base.height,
    gainWidth: result.gainMap.width,
    gainHeight: result.gainMap.height,
    quality,
    headroom: options.headroom,
    baseLength: result.base.data.byteLength,
    gainLength: result.gainMap.data.byteLength,
  }
  const headerBytes = new TextEncoder().encode(JSON.stringify(header))
  const payload = new Uint8Array(4 + headerBytes.byteLength + header.baseLength + header.gainLength)
  new DataView(payload.buffer).setUint32(0, headerBytes.byteLength, true)
  payload.set(headerBytes, 4)
  payload.set(result.base.data, 4 + headerBytes.byteLength)
  payload.set(result.gainMap.data, 4 + headerBytes.byteLength + header.baseLength)
  return payload
}

function getResponseFileName(response: Response) {
  const disposition = response.headers.get('content-disposition')
  const match = disposition?.match(/filename="([^"]+)"/i)
  return match?.[1]
}

function withExtension(name: string, ext: string) {
  const cleanName = name || 'bypass-hdr'
  const dot = cleanName.lastIndexOf('.')
  const stem = dot > 0 ? cleanName.slice(0, dot) : cleanName
  return `${stem}${ext}`
}
