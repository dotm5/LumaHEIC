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
import {
  getInitialLanguage,
  languageLabels,
  saveLanguage,
  translations,
  type Language,
  type TranslationKey,
} from './lib/i18n'
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
type StatusState = {
  key: TranslationKey
  fallback?: string
}

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
  const [language, setLanguage] = React.useState<Language>(() => getInitialLanguage())
  const [sourceName, setSourceName] = React.useState('')
  const [sourceImage, setSourceImage] = React.useState<RgbaImage | null>(null)
  const [options, setOptions] = React.useState<BypassOptions>(defaultBypassOptions)
  const [extremeGainMap, setExtremeGainMap] = React.useState(false)
  const [quality, setQuality] = React.useState(82)
  const [preview, setPreview] = React.useState<PreviewState | null>(null)
  const [result, setResult] = React.useState<GainMapResult | null>(null)
  const [output, setOutput] = React.useState<OutputState | null>(null)
  const [status, setStatus] = React.useState<StatusState>({ key: 'statusDrop' })
  const [encoderCheck, setEncoderCheck] = React.useState<EncoderCheckState>('checking')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const encoderReady = encoderCheck === 'ready'
  const t = translations[language]

  React.useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    saveLanguage(language)
  }, [language])

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
        setStatus(translateWorkerProgress(message))
        return
      }
      if (type === 'error') {
        setBusy(false)
        setError(message)
        setStatus({ key: 'statusProcessingFailed' })
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
          setStatus(translateEncoderMessage(encodedResult.message))
        } else {
          setStatus({ key: 'statusPreviewUpdated' })
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
      setStatus({ key: 'statusDecodingSource' })
      const decoded = await decodeImageFile(file)
      const signal = detectUsefulGain(decoded)
      setSourceName(file.name)
      setSourceImage(decoded)
      setStatus(
        signal.isLowDynamicRange
          ? { key: 'statusImageDecodedLowLuminance' }
          : { key: 'statusImageDecodedPreview' },
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus({ key: 'statusCouldNotLoadImage' })
      setBusy(false)
    }
  }

  const processImage = React.useCallback((encode: boolean) => {
    if (!sourceImage) return
    if (encode && !encoderReady) {
      setError(t.errorBrowserEncoderUnavailable)
      setStatus({ key: 'statusExportUnavailable' })
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
  }, [encoderReady, options, quality, sourceImage, sourceName, t.errorBrowserEncoderUnavailable])

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
          <p className="eyebrow">{t.appEyebrow}</p>
          <h1>{t.appTitle}</h1>
        </div>
        <div className="topbar-actions">
          <div className="language-switch" aria-label="Language">
            {(['en', 'zh'] satisfies Language[]).map((nextLanguage) => (
              <button
                key={nextLanguage}
                className={language === nextLanguage ? 'active' : undefined}
                type="button"
                onClick={() => setLanguage(nextLanguage)}
              >
                {languageLabels[nextLanguage]}
              </button>
            ))}
          </div>
          <a className="repo-link" href="https://github.com/chemharuka/toGainMapHDR" target="_blank">
            {t.swiftReference}
          </a>
        </div>
      </header>

      <section className="workspace">
        <aside className="control-panel">
          <label className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
            <ImageUp aria-hidden="true" />
            <span>{sourceName || t.chooseImage}</span>
            <input
              type="file"
              accept="image/jpeg,image/png,.jpg,.jpeg,.png"
              onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
            />
          </label>

          <p className={encoderReady ? 'encoder-status ready' : 'encoder-status'}>
            {encoderCheck === 'checking' && t.encoderChecking}
            {encoderCheck === 'ready' && t.encoderReady}
            {encoderCheck === 'missing' && t.encoderMissing}
          </p>

          <div className="panel-heading">
            <SlidersHorizontal aria-hidden="true" />
            <h2>{t.controlsHeading}</h2>
          </div>

          <Slider
            label={t.hdrStrength}
            value={options.intensity}
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(intensity) => setOptions((state) => ({ ...state, intensity }))}
          />
          <Slider
            label={t.highlightThreshold}
            value={options.threshold}
            min={0.05}
            max={0.95}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(threshold) => setOptions((state) => ({ ...state, threshold }))}
          />
          <Slider
            label={t.transitionSoftness}
            value={options.softness}
            min={0.02}
            max={0.8}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(softness) => setOptions((state) => ({ ...state, softness }))}
          />
          <Slider
            label={t.peakHeadroom}
            value={options.headroom}
            min={1.05}
            max={8}
            step={0.05}
            format={(v) => `${v.toFixed(2)}x`}
            onChange={(headroom) => setOptions((state) => ({ ...state, headroom }))}
          />
          <Slider
            label={t.colorProtection}
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
              <span>{t.extremeGainDebug}</span>
            </label>
          )}
          <Slider
            label={t.heicQuality}
            value={quality}
            min={45}
            max={100}
            step={1}
            format={(v) => `${Math.round(v)}`}
            onChange={(nextQuality) => setQuality(nextQuality)}
          />

          <button className="primary-action" disabled={!sourceImage || busy || !encoderReady} onClick={() => processImage(true)}>
            {busy ? <Loader2 className="spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
            {t.exportHeic}
          </button>

          {output && (
            <a className="download-action" download={output.fileName} href={output.url}>
              <Download aria-hidden="true" />
              {output.kind === 'heic' ? t.downloadHeic : t.downloadDebugPackage}
            </a>
          )}

          <p className="status-line">{status.fallback ?? t[status.key]}</p>
          {error && <p className="error-line">{error}</p>}
        </aside>

        <section className="preview-panel">
          <div className="preview-grid">
            <Preview title={t.sdrBase} url={preview?.baseUrl} />
            <Preview title={t.gainMap} url={preview?.gainUrl} />
            <Preview title={t.hdrReference} url={preview?.hdrUrl} />
          </div>

          <div className="metrics">
            <Metric label={t.canvas} value={result ? `${result.base.width} x ${result.base.height}` : '-'} />
            <Metric
              label={t.gainMap}
              value={result ? `${result.gainMap.width} x ${result.gainMap.height}` : '-'}
            />
            <Metric
              label={t.activePixels}
              value={result ? `${Math.round((result.stats.activePixels / (result.base.width * result.base.height)) * 100)}%` : '-'}
            />
            <Metric label={t.headroom} value={result ? `${result.stats.headroomStops.toFixed(2)} ${t.stops}` : '-'} />
          </div>

          {output && <p className="output-note">{translateOutputLabel(output.label, t)}</p>}
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

function translateWorkerProgress(message: string): StatusState {
  if (message === 'Generating Apple-style gain map') return { key: 'statusGeneratingGainMap' }
  if (message === 'Encoding HEIC payload') return { key: 'statusEncodingHeic' }
  return { key: 'statusProcessingFailed', fallback: message }
}

function translateEncoderMessage(message: string): StatusState {
  if (message === translations.en.encodedHeicLocal) return { key: 'encodedHeicLocal' }
  return { key: 'statusPreviewUpdated', fallback: message }
}

function translateOutputLabel(label: string, t: typeof translations.en) {
  return label === translations.en.encodedHeicLocal ? t.encodedHeicLocal : label
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
