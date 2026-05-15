import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const rootDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const distDir = join(rootDir, 'dist')
const encoderDir = join(rootDir, 'public', 'encoders')
const port = Number(process.env.PORT || 8787)
const maxBodyBytes = Number(process.env.MAX_ENCODE_BODY_BYTES || 128 * 1024 * 1024)
const encoderPromise = loadEncoder()

createServer(async (request, response) => {
  try {
    addCorsHeaders(response)

    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      response.end()
      return
    }

    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
    if (url.pathname === '/api/health') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true }))
      return
    }

    if (url.pathname === '/api/encode-heic') {
      if (request.method !== 'POST') {
        sendText(response, 405, 'POST required')
        return
      }
      await handleEncode(request, response)
      return
    }

    await serveStatic(url.pathname, response)
  } catch (error) {
    console.error(error)
    sendText(response, 500, error instanceof Error ? error.message : String(error))
  }
}).listen(port, () => {
  console.log(`WASM HEIC backend listening at http://127.0.0.1:${port}`)
})

async function handleEncode(request, response) {
  const body = await readBody(request)
  const parsed = parsePayload(body)
  const encoder = await encoderPromise
  const bytes = encodeHeic(encoder, parsed)
  const fileName = withExtension(parsed.header.sourceName, '.heic')

  response.writeHead(200, {
    'content-type': 'image/heic',
    'content-length': String(bytes.byteLength),
    'content-disposition': `attachment; filename="${escapeHeaderValue(fileName)}"`,
    'cache-control': 'no-store',
  })
  response.end(bytes)
}

async function loadEncoder() {
  const jsPath = join(encoderDir, 'apple-hdr-heic.js')
  const wasmPath = join(encoderDir, 'apple-hdr-heic.wasm')
  const [{ default: createModule }, wasmBinary] = await Promise.all([
    import(pathToFileURL(jsPath).href),
    readFile(wasmPath),
  ])

  return createModule({
    wasmBinary,
    noInitialRun: true,
  })
}

function encodeHeic(module, parsed) {
  const { header, base, gain } = parsed
  const basePtr = module._malloc(base.byteLength)
  const gainPtr = module._malloc(gain.byteLength)
  const outPtrPtr = module._malloc(4)
  const outLenPtr = module._malloc(4)

  try {
    module.HEAPU8.set(base, basePtr)
    module.HEAPU8.set(gain, gainPtr)
    const status = module.ccall(
      'encode_apple_hdr_heic',
      'number',
      ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [
        basePtr,
        header.width,
        header.height,
        gainPtr,
        header.gainWidth,
        header.gainHeight,
        header.quality,
        header.headroom,
        outPtrPtr,
        outLenPtr,
        0,
      ],
    )

    if (status !== 0) {
      throw new Error(`WASM encoder returned status ${status}`)
    }

    const view = new DataView(module.HEAPU8.buffer)
    const outPtr = view.getUint32(outPtrPtr, true)
    const outLen = view.getUint32(outLenPtr, true)
    const bytes = Buffer.from(module.HEAPU8.slice(outPtr, outPtr + outLen))
    module.ccall('free_encoded_buffer', 'number', ['number'], [outPtr])
    return bytes
  } finally {
    module._free(basePtr)
    module._free(gainPtr)
    module._free(outPtrPtr)
    module._free(outLenPtr)
  }
}

async function readBody(request) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.byteLength
    if (total > maxBodyBytes) {
      throw new Error(`Request body exceeds ${maxBodyBytes} bytes`)
    }
    chunks.push(chunk)
  }
  return Buffer.concat(chunks, total)
}

function parsePayload(body) {
  if (body.byteLength < 4) {
    throw new Error('Malformed encode request')
  }

  const headerLength = body.readUInt32LE(0)
  const headerEnd = 4 + headerLength
  if (headerLength <= 0 || headerEnd > body.byteLength) {
    throw new Error('Invalid request header length')
  }

  const header = JSON.parse(body.subarray(4, headerEnd).toString('utf8'))
  validateHeader(header)

  const baseStart = headerEnd
  const baseEnd = baseStart + header.baseLength
  const gainEnd = baseEnd + header.gainLength
  if (gainEnd !== body.byteLength) {
    throw new Error('Request payload sizes do not match header')
  }

  return {
    header,
    base: body.subarray(baseStart, baseEnd),
    gain: body.subarray(baseEnd, gainEnd),
  }
}

function validateHeader(header) {
  const expectedBaseLength = header.width * header.height * 4
  const expectedGainLength = header.gainWidth * header.gainHeight
  const fields = ['width', 'height', 'gainWidth', 'gainHeight', 'quality', 'headroom', 'baseLength', 'gainLength']

  for (const field of fields) {
    if (!Number.isFinite(header[field]) || header[field] <= 0) {
      throw new Error(`Invalid ${field}`)
    }
  }
  if (header.baseLength !== expectedBaseLength || header.gainLength !== expectedGainLength) {
    throw new Error('Image dimensions do not match payload lengths')
  }
}

async function serveStatic(pathname, response) {
  const requested = pathname === '/' ? '/index.html' : decodeURIComponent(pathname)
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, '')
  let filePath = resolve(join(distDir, safePath))
  if (!filePath.startsWith(distDir)) {
    sendText(response, 403, 'Forbidden')
    return
  }

  try {
    const info = await stat(filePath)
    if (info.isDirectory()) {
      filePath = join(filePath, 'index.html')
    }
  } catch {
    filePath = join(distDir, 'index.html')
  }

  createReadStream(filePath)
    .on('error', () => sendText(response, 404, 'Run npm run build:wasm before serve:wasm'))
    .once('open', () => {
      response.writeHead(200, {
        'content-type': contentType(filePath),
      })
    })
    .pipe(response)
}

function addCorsHeaders(response) {
  response.setHeader('access-control-allow-origin', '*')
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
  response.setHeader('access-control-allow-headers', 'content-type')
}

function sendText(response, status, message) {
  if (response.headersSent) return
  response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' })
  response.end(message)
}

function contentType(filePath) {
  switch (extname(filePath)) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    case '.wasm':
      return 'application/wasm'
    default:
      return 'application/octet-stream'
  }
}

function withExtension(name, ext) {
  const cleanName = name || 'bypass-hdr'
  const dot = cleanName.lastIndexOf('.')
  const stem = dot > 0 ? cleanName.slice(0, dot) : cleanName
  return `${stem}${ext}`
}

function escapeHeaderValue(value) {
  return value.replace(/["\r\n]/g, '_')
}
