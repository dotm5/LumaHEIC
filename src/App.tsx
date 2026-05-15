import { Download, FileImage, ImageUp, Loader2, SlidersHorizontal, Sparkles } from 'lucide-react'
import React from 'react'
import './App.css'
import type { HeicEncodeResult } from './lib/encoderTypes'
import {
  defaultBypassOptions,
  detectUsefulGain,
  type BypassOptions,
  type GainMapResult,
  type RgbaImage,
} from './lib/gainMap'
import { decodeImageFile, imageToPngUrl } from './lib/imageIo'

type PreviewState = {
  baseUrl: string
  gainUrl: string
  hdrUrl: string
}

type OutputState = {
  url: string
  fileName: string
  label: string
  kind: HeicEncodeResult['kind']
}

type EncoderCheckState = 'checking' | 'ready' | 'missing'

const worker = new Worker(new URL('./workers/bypassWorker.ts', import.meta.url), {
  type: 'module',
})

let nextRequestId = 1
const showDebugControls = import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')
const extremeGainMapOptions: BypassOptions = {
  headroom: 8,
  intensity: 1,
  threshold: 0.2,
  softness: 0.1,
  colorProtection: 0,
}

function App() {
  const [sourceName, setSourceName] = React.useState('')
  const [sourceImage, setSourceImage] = React.useState<RgbaImage | null>(null)
  const [options, setOptions] = React.useState<BypassOptions>(defaultBypassOptions)
  const [extremeGainMap, setExtremeGainMap] = React.useState(false)
  const [quality, setQuality] = React.useState(82)
  const [preview, setPreview] = React.useState<PreviewState | null>(null)
  const [result, setResult] = React.useState<GainMapResult | null>(null)
  const [output, setOutput] = React.useState<OutputState | null>(null)
  const [status, setStatus] = React.useState('Drop or choose a JPEG/PNG to begin')
  const [encoderCheck, setEncoderCheck] = React.useState<EncoderCheckState>('checking')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const encoderReady = encoderCheck === 'ready'

  React.useEffect(() => {
    return () => revokePreview(preview)
  }, [preview])

  React.useEffect(() => {
    return () => {
      if (output) URL.revokeObjectURL(output.url)
    }
  }, [output])

  React.useEffect(() => {
    let cancelled = false
    Promise.all([checkEncoderAsset('apple-hdr-heic.js'), checkEncoderAsset('apple-hdr-heic.wasm')])
      .then(() => {
        if (!cancelled) setEncoderCheck('ready')
      })
      .catch(() => {
        if (!cancelled) setEncoderCheck('missing')
      })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    worker.onmessage = (event: MessageEvent) => {
      const { type, message, result: workerResult, encoded } = event.data
      if (type === 'progress') {
        setStatus(message)
        return
      }
      if (type === 'error') {
        setBusy(false)
        setError(message)
        setStatus('Processing failed')
        return
      }
      if (type === 'processed' || type === 'encoded') {
        const nextResult = workerResult as GainMapResult
        setResult(nextResult)
        setPreview((current) => {
          revokePreview(current)
          return {
            baseUrl: imageToPngUrl(nextResult.base),
            gainUrl: imageToPngUrl(nextResult.gainMapPreview),
            hdrUrl: imageToPngUrl(nextResult.hdrPreview),
          }
        })

        if (type === 'encoded') {
          const encodedResult = encoded as HeicEncodeResult
          setOutput((current) => {
            if (current) URL.revokeObjectURL(current.url)
            return {
              url: URL.createObjectURL(
                new Blob([toArrayBuffer(encodedResult.bytes)], { type: encodedResult.mimeType }),
              ),
              fileName: encodedResult.fileName,
              label: encodedResult.message,
              kind: encodedResult.kind,
            }
          })
          setStatus(encodedResult.message)
        } else {
          setStatus('Preview updated')
        }
        setBusy(false)
      }
    }
  }, [])

  const setExtremeDebugMode = (enabled: boolean) => {
    setExtremeGainMap(enabled)
    setOptions(enabled ? extremeGainMapOptions : defaultBypassOptions)
  }

  const handleFile = async (file: File | null) => {
    if (!file) return
    setBusy(true)
    setError(null)
    setOutput((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
    try {
      setStatus('Decoding source image')
      const decoded = await decodeImageFile(file)
      const signal = detectUsefulGain(decoded)
      setSourceName(file.name)
      setSourceImage(decoded)
      setStatus(
        signal.isLowDynamicRange
          ? 'Image decoded. Low luminance detected; use a stronger headroom if needed.'
          : 'Image decoded. Building bypass preview.',
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus('Could not load image')
      setBusy(false)
    }
  }

  const processImage = React.useCallback((encode: boolean) => {
    if (!sourceImage) return
    if (encode && !encoderReady) {
      setError('Browser HEIC encoder is not available')
      setStatus('Export unavailable')
      return
    }
    setBusy(true)
    setError(null)
    if (encode) {
      setOutput((current) => {
        if (current) URL.revokeObjectURL(current.url)
        return null
      })
    }
    const requestImage = {
      width: sourceImage.width,
      height: sourceImage.height,
      data: new Uint8ClampedArray(sourceImage.data),
    }
    const id = nextRequestId++
    worker.postMessage(
      {
        type: 'process',
        id,
        sourceName,
        image: requestImage,
        options,
        quality,
        encode,
      },
      [requestImage.data.buffer as ArrayBuffer],
    )
  }, [encoderReady, options, quality, sourceImage, sourceName])

  React.useEffect(() => {
    if (!sourceImage) return
    const handle = window.setTimeout(() => {
      processImage(false)
    }, 140)
    return () => window.clearTimeout(handle)
  }, [processImage, sourceImage])

  const onDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    handleFile(event.dataTransfer.files[0] ?? null)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Single-image bypass</p>
          <h1>HDR HEIC Gain Map Lab</h1>
        </div>
        <a className="repo-link" href="https://github.com/chemharuka/toGainMapHDR" target="_blank">
          Swift reference
        </a>
      </header>

      <section className="workspace">
        <aside className="control-panel">
          <label className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
            <ImageUp aria-hidden="true" />
            <span>{sourceName || 'Choose JPEG/PNG'}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,.jpg,.jpeg,.png"
              onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
            />
          </label>

          <p className={encoderReady ? 'encoder-status ready' : 'encoder-status'}>
            {encoderCheck === 'checking' && 'Checking local HEIC encoder files...'}
            {encoderCheck === 'ready' && 'HEIC encoder ready. All processing runs locally in your browser.'}
            {encoderCheck === 'missing' && 'HEIC encoder files are missing. Export is unavailable.'}
          </p>

          <div className="panel-heading">
            <SlidersHorizontal aria-hidden="true" />
            <h2>Bypass Controls</h2>
          </div>

          <Slider
            label="HDR strength"
            value={options.intensity}
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(intensity) => setOptions((state) => ({ ...state, intensity }))}
          />
          <Slider
            label="Highlight threshold"
            value={options.threshold}
            min={0.05}
            max={0.95}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(threshold) => setOptions((state) => ({ ...state, threshold }))}
          />
          <Slider
            label="Transition softness"
            value={options.softness}
            min={0.02}
            max={0.8}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(softness) => setOptions((state) => ({ ...state, softness }))}
          />
          <Slider
            label="Peak headroom"
            value={options.headroom}
            min={1.05}
            max={8}
            step={0.05}
            format={(v) => `${v.toFixed(2)}x`}
            onChange={(headroom) => setOptions((state) => ({ ...state, headroom }))}
          />
          <Slider
            label="Color protection"
            value={options.colorProtection}
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(colorProtection) => setOptions((state) => ({ ...state, colorProtection }))}
          />
          {showDebugControls && (
            <label className="debug-toggle">
              <input
                type="checkbox"
                checked={extremeGainMap}
                onChange={(event) => setExtremeDebugMode(event.target.checked)}
              />
              <span>Extreme gain map debug</span>
            </label>
          )}
          <Slider
            label="HEIC quality"
            value={quality}
            min={45}
            max={100}
            step={1}
            format={(v) => `${Math.round(v)}`}
            onChange={(nextQuality) => setQuality(nextQuality)}
          />

          <button className="primary-action" disabled={!sourceImage || busy || !encoderReady} onClick={() => processImage(true)}>
            {busy ? <Loader2 className="spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            Export Apple HDR HEIC
          </button>

          {output && (
            <a className="download-action" download={output.fileName} href={output.url}>
              <Download aria-hidden="true" />
              {output.kind === 'heic' ? 'Download HEIC' : 'Download debug package'}
            </a>
          )}

          <p className="status-line">{status}</p>
          {error && <p className="error-line">{error}</p>}
        </aside>

        <section className="preview-panel">
          <div className="preview-grid">
            <Preview title="SDR base" url={preview?.baseUrl} />
            <Preview title="Gain map" url={preview?.gainUrl} />
            <Preview title="HDR reference" url={preview?.hdrUrl} />
          </div>

          <div className="metrics">
            <Metric label="Canvas" value={result ? `${result.base.width} x ${result.base.height}` : '-'} />
            <Metric
              label="Gain map"
              value={result ? `${result.gainMap.width} x ${result.gainMap.height}` : '-'}
            />
            <Metric
              label="Active pixels"
              value={result ? `${Math.round((result.stats.activePixels / (result.base.width * result.base.height)) * 100)}%` : '-'}
            />
            <Metric label="Headroom" value={result ? `${result.stats.headroomStops.toFixed(2)} stops` : '-'} />
          </div>

          {output && <p className="output-note">{output.label}</p>}
        </section>
      </section>
    </main>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}) {
  return (
    <label className="slider-row">
      <span>
        {label}
        <strong>{format(value)}</strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function Preview({ title, url }: { title: string; url?: string }) {
  return (
    <article className="preview-tile">
      <header>
        <FileImage aria-hidden="true" />
        <h2>{title}</h2>
      </header>
      {url ? <img src={url} alt={title} /> : <div className="empty-preview" />}
    </article>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

async function checkEncoderAsset(fileName: string) {
  const url = `${import.meta.env.BASE_URL}encoders/${fileName}`
  const head = await fetch(url, { method: 'HEAD', cache: 'no-store' })
  if (head.ok) return

  const get = await fetch(url, { method: 'GET', cache: 'no-store' })
  if (!get.ok) {
    throw new Error(`${fileName} is missing`)
  }
}

function revokePreview(preview: PreviewState | null) {
  if (!preview) return
}

function toArrayBuffer(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export default App
