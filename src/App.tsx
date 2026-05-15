import { Download, FileImage, ImageUp, Loader2, SlidersHorizontal, Sparkles } from 'lucide-react'
import React from 'react'
import './App.css'
import { ParameterField } from './components/ParameterField'
import {
  defaultPresetId,
  gainMapResolutionModes,
  hdrPresets,
  type GainMapResolutionMode,
  type InputMode,
  type PresetId,
  type PresetSelection,
} from './lib/authoring'
import type { HeicEncodeResult } from './lib/encoderTypes'
import {
  defaultBypassOptions,
  detectUsefulGain,
  normalizeHdrGainMapControls,
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
import { parameterHelp, type ParameterHelpCopy } from './lib/parameterHelp'
import { decodeImageFile, imageToPngUrl } from './lib/imageIo'

type PreviewState = {
  baseUrl: string
  maskUrl: string
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

function App() {
  const [language, setLanguage] = React.useState<Language>(() => getInitialLanguage())
  const [inputMode, setInputMode] = React.useState<InputMode>('single-image-enhance')
  const [currentPreset, setCurrentPreset] = React.useState<PresetSelection>(defaultPresetId)
  const [sourceName, setSourceName] = React.useState('')
  const [sourceImage, setSourceImage] = React.useState<RgbaImage | null>(null)
  const [gainMapName, setGainMapName] = React.useState('')
  const [gainMapImage, setGainMapImage] = React.useState<RgbaImage | null>(null)
  const [options, setOptions] = React.useState<BypassOptions>(defaultBypassOptions)
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
  const help = parameterHelp[language]
  const canProcess = Boolean(sourceImage && (inputMode === 'single-image-enhance' || gainMapImage))

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
            maskUrl: imageToPngUrl(nextResult.highlightMaskPreview),
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

  const applyPreset = (presetId: PresetId) => {
    setCurrentPreset(presetId)
    setOptions(hdrPresets[presetId])
  }

  const updateOptions = (patch: Partial<BypassOptions>) => {
    setCurrentPreset('custom')
    setOptions((state) => normalizeHdrGainMapControls({ ...state, ...patch }))
  }

  const handleImageFile = async (file: File | null, target: 'source' | 'gain-map') => {
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
      if (target === 'gain-map') {
        setGainMapName(file.name)
        setGainMapImage(decoded)
        setStatus({ key: 'statusGainMapDecodedPreview' })
      } else {
        const signal = detectUsefulGain(decoded)
        setSourceName(file.name)
        setSourceImage(decoded)
        setStatus(
          signal.isLowDynamicRange
            ? { key: 'statusImageDecodedLowLuminance' }
            : { key: 'statusImageDecodedPreview' },
        )
      }
      if (
        (target === 'source' && inputMode === 'base-plus-gain-map' && !gainMapImage) ||
        (target === 'gain-map' && !sourceImage)
      ) {
        setBusy(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus({ key: 'statusCouldNotLoadImage' })
      setBusy(false)
    }
  }

  const processImage = React.useCallback((encode: boolean) => {
    if (!sourceImage) return
    if (inputMode === 'base-plus-gain-map' && !gainMapImage) return
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
    const requestGainMapImage = gainMapImage
      ? {
          width: gainMapImage.width,
          height: gainMapImage.height,
          data: new Uint8ClampedArray(gainMapImage.data),
        }
      : undefined
    const id = nextRequestId++
    const transfer = [requestImage.data.buffer as ArrayBuffer]
    if (requestGainMapImage) transfer.push(requestGainMapImage.data.buffer as ArrayBuffer)
    worker.postMessage(
      {
        type: 'process',
        id,
        mode: inputMode,
        sourceName,
        image: requestImage,
        gainMapImage: requestGainMapImage,
        options,
        quality,
        encode,
      },
      transfer,
    )
  }, [encoderReady, gainMapImage, inputMode, options, quality, sourceImage, sourceName, t.errorBrowserEncoderUnavailable])

  React.useEffect(() => {
    if (!sourceImage) return
    if (inputMode === 'base-plus-gain-map' && !gainMapImage) return
    const handle = window.setTimeout(() => {
      processImage(false)
    }, 140)
    return () => window.clearTimeout(handle)
  }, [gainMapImage, inputMode, processImage, sourceImage])

  const onDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    handleImageFile(event.dataTransfer.files[0] ?? null, 'source')
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img className="brand-icon" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" aria-hidden="true" />
          <div>
            <p className="eyebrow">{t.appEyebrow}</p>
            <h1>{t.appTitle}</h1>
          </div>
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
        </div>
      </header>

      <section className="workspace">
        <aside className="control-panel">
          <ParameterField language={language} label={t.inputMode} help={help.inputMode} className="mode-switch-field">
            {(describedById) => (
              <div className="mode-switch" aria-label={t.inputMode}>
                <button
                  className={inputMode === 'single-image-enhance' ? 'active' : undefined}
                  type="button"
                  aria-describedby={describedById}
                  onClick={() => setInputMode('single-image-enhance')}
                >
                  {t.singleImageEnhance}
                </button>
                <button
                  className={inputMode === 'base-plus-gain-map' ? 'active' : undefined}
                  type="button"
                  aria-describedby={describedById}
                  onClick={() => setInputMode('base-plus-gain-map')}
                >
                  {t.basePlusGainMap}
                </button>
              </div>
            )}
          </ParameterField>

          <div className="drop-stack">
            <label className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
              <ImageUp aria-hidden="true" />
              <span>{sourceName || (inputMode === 'base-plus-gain-map' ? t.chooseBaseImage : t.chooseImage)}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                onChange={(event) => handleImageFile(event.target.files?.[0] ?? null, 'source')}
              />
            </label>
            {inputMode === 'base-plus-gain-map' && (
              <label className="drop-zone secondary-drop" onDragOver={(event) => event.preventDefault()}>
                <FileImage aria-hidden="true" />
                <span>{gainMapName || t.chooseGainMapImage}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                  onChange={(event) => handleImageFile(event.target.files?.[0] ?? null, 'gain-map')}
                />
              </label>
            )}
          </div>

          <p className={encoderReady ? 'encoder-status ready' : 'encoder-status'}>
            {encoderCheck === 'checking' && t.encoderChecking}
            {encoderCheck === 'ready' && t.encoderReady}
            {encoderCheck === 'missing' && t.encoderMissing}
          </p>

          <div className="panel-heading">
            <SlidersHorizontal aria-hidden="true" />
            <h2>{t.controlsHeading}</h2>
          </div>

          <section className="control-section">
            <h3>{t.basicControls}</h3>
            <SelectRow
              language={language}
              label={t.preset}
              help={help.preset}
              value={currentPreset}
              onChange={(value) => {
                if (value !== 'custom') applyPreset(value as PresetId)
              }}
              options={[
                ...Object.keys(hdrPresets).map((id) => ({
                  value: id,
                  label: t[presetTranslationKey(id as PresetId)],
                })),
                ...(currentPreset === 'custom' ? [{ value: 'custom', label: t.customPreset }] : []),
              ]}
            />
            <Slider
              language={language}
              label={t.hdrStrength}
              help={help.hdrStrength}
              value={options.hdrStrengthStops}
              min={0}
              max={3}
              step={0.05}
              format={(v) => `${v.toFixed(2)} ${t.stops}`}
              onChange={(hdrStrengthStops) => updateOptions({ hdrStrengthStops })}
            />
            <Slider
              language={language}
              label={t.highlightStart}
              help={help.highlightStart}
              value={options.highlightStartPct}
              min={80}
              max={99.5}
              step={0.1}
              format={formatPercentPoint}
              onChange={(highlightStartPct) => updateOptions({ highlightStartPct })}
            />
            <Slider
              language={language}
              label={t.highlightRolloff}
              help={help.highlightRolloff}
              value={options.highlightRolloffPct}
              min={Math.min(99.8, options.highlightStartPct + 0.1)}
              max={99.9}
              step={0.1}
              format={formatPercentPoint}
              onChange={(highlightRolloffPct) => updateOptions({ highlightRolloffPct })}
            />
            <Slider
              language={language}
              label={t.shadowLift}
              help={help.shadowLift}
              value={options.shadowLift}
              min={0}
              max={0.5}
              step={0.01}
              format={formatPercent}
              onChange={(shadowLift) => updateOptions({ shadowLift })}
            />
            <Slider
              language={language}
              label={t.colorProtect}
              help={help.colorProtect}
              value={options.colorProtect}
              min={0}
              max={1}
              step={0.01}
              format={formatPercent}
              onChange={(colorProtect) => updateOptions({ colorProtect })}
            />
            <Slider
              language={language}
              label={t.detail}
              help={help.detail}
              value={options.detail}
              min={0}
              max={0.5}
              step={0.01}
              format={formatPercent}
              onChange={(detail) => updateOptions({ detail })}
            />
          </section>

          <details className="control-section">
            <summary>{t.advancedControls}</summary>
            <Slider
              language={language}
              label={t.headroom}
              help={help.headroom}
              value={options.headroomStops}
              min={0}
              max={4}
              step={0.05}
              format={(v) => `${v.toFixed(2)} ${t.stops}`}
              onChange={(headroomStops) => updateOptions({ headroomStops })}
            />
            <Slider
              language={language}
              label={t.midtoneLock}
              help={help.midtoneLock}
              value={options.midtoneLock}
              min={0}
              max={1}
              step={0.01}
              format={formatPercent}
              onChange={(midtoneLock) => updateOptions({ midtoneLock })}
            />
            <Slider
              language={language}
              label={t.edgeAwareSmoothness}
              help={help.edgeAwareRadius}
              value={options.edgeAwareRadius}
              min={0}
              max={32}
              step={1}
              format={(v) => `${Math.round(v)} px`}
              onChange={(edgeAwareRadius) => updateOptions({ edgeAwareRadius })}
            />
            <Slider
              language={language}
              label={t.edgeAwareEps}
              help={help.edgeAwareEps}
              value={options.edgeAwareEps}
              min={0.0001}
              max={0.02}
              step={0.0001}
              format={(v) => v.toFixed(4)}
              onChange={(edgeAwareEps) => updateOptions({ edgeAwareEps })}
            />
            <Slider
              language={language}
              label={t.clipGuard}
              help={help.clipGuard}
              value={options.clipGuard}
              min={0}
              max={1}
              step={0.01}
              format={formatPercent}
              onChange={(clipGuard) => updateOptions({ clipGuard })}
            />
            <Slider
              language={language}
              label={t.gainMapGamma}
              help={help.gainMapGamma}
              value={options.gainMapGamma}
              min={0.6}
              max={2.2}
              step={0.01}
              format={(v) => v.toFixed(2)}
              onChange={(gainMapGamma) => updateOptions({ gainMapGamma })}
            />
            <Slider
              language={language}
              label={t.whitePointGuard}
              help={help.whitePointGuard}
              value={options.whitePointGuardPct}
              min={98}
              max={99.95}
              step={0.05}
              format={formatPercentPoint}
              onChange={(whitePointGuardPct) => updateOptions({ whitePointGuardPct })}
            />
            <Slider
              language={language}
              label={t.blackPointGuard}
              help={help.blackPointGuard}
              value={options.blackPointGuardPct}
              min={0}
              max={2}
              step={0.05}
              format={formatPercentPoint}
              onChange={(blackPointGuardPct) => updateOptions({ blackPointGuardPct })}
            />
            <SelectRow
              language={language}
              label={t.gainMapResolution}
              help={help.gainMapResolution}
              value={options.gainMapResolutionMode}
              onChange={(gainMapResolutionMode) =>
                updateOptions({ gainMapResolutionMode: gainMapResolutionMode as GainMapResolutionMode })
              }
              options={gainMapResolutionModes.map((mode) => ({
                value: mode,
                label: t[resolutionTranslationKey(mode)],
                disabled: mode === 'custom',
              }))}
            />
          </details>
          {showDebugControls && (
            <section className="control-section debug-section">
              <h3>{t.debugControls}</h3>
              <dl className="debug-list">
                <div>
                  <dt>{t.currentPreset}</dt>
                  <dd>{currentPreset === 'custom' ? t.customPreset : t[presetTranslationKey(currentPreset)]}</dd>
                </div>
                <div>
                  <dt>{t.gainMapOutputSize}</dt>
                  <dd>{result ? `${result.gainMap.width} x ${result.gainMap.height}` : '-'}</dd>
                </div>
                <div>
                  <dt>{t.luminanceStats}</dt>
                  <dd>{result ? formatLuminanceStats(result) : '-'}</dd>
                </div>
                <div>
                  <dt>{t.gainStats}</dt>
                  <dd>{result ? formatGainStats(result) : '-'}</dd>
                </div>
                <div>
                  <dt>{t.processingTime}</dt>
                  <dd>{result?.stats.timings ? `${result.stats.timings.totalMs.toFixed(1)} ms` : '-'}</dd>
                </div>
              </dl>
              {preview?.gainUrl && (
                <a className="mini-action" download={withSuffix(sourceName, '-gain-map.png')} href={preview.gainUrl}>
                  <Download aria-hidden="true" />
                  {t.downloadGainMapPng}
                </a>
              )}
            </section>
          )}
          <Slider
            language={language}
            label={t.heicQuality}
            help={help.heicQuality}
            value={quality}
            min={45}
            max={100}
            step={1}
            format={(v) => `${Math.round(v)}`}
            onChange={(nextQuality) => setQuality(nextQuality)}
          />

          <button className="primary-action" disabled={!canProcess || busy || !encoderReady} onClick={() => processImage(true)}>
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
            <Preview title={inputMode === 'single-image-enhance' ? t.highlightMask : t.suppliedGainMap} url={preview?.maskUrl} />
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
            <Metric label={t.luminanceP95} value={result ? formatLinear(result.stats.luminance.p95) : '-'} />
            <Metric label={t.gainLog2Range} value={result ? `${result.stats.gain.min.toFixed(2)}-${result.stats.gain.max.toFixed(2)}` : '-'} />
          </div>

          {output && <p className="output-note">{translateOutputLabel(output.label, t)}</p>}
        </section>
      </section>

      <footer className="app-footer">
        <span>{t.conceptReferencePrefix}</span>
        <a href="https://github.com/chemharuka/toGainMapHDR" target="_blank">
          toGainMapHDR
        </a>
      </footer>
    </main>
  )
}

function Slider({
  language,
  label,
  help,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  language: Language
  label: string
  help: ParameterHelpCopy
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}) {
  const id = React.useId()
  return (
    <ParameterField language={language} id={id} label={label} value={format(value)} help={help} className="slider-row">
      {(describedById) => (
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-describedby={describedById}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      )}
    </ParameterField>
  )
}

function SelectRow({
  language,
  label,
  help,
  value,
  options,
  onChange,
}: {
  language: Language
  label: string
  help: ParameterHelpCopy
  value: string
  options: { value: string; label: string; disabled?: boolean }[]
  onChange: (value: string) => void
}) {
  const id = React.useId()
  return (
    <ParameterField language={language} id={id} label={label} help={help} className="select-row">
      {(describedById) => (
        <select id={id} value={value} aria-describedby={describedById} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </ParameterField>
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

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatPercentPoint(value: number) {
  return `${value.toFixed(value < 10 ? 2 : 1)}%`
}

function formatLinear(value: number) {
  return value < 0.01 ? value.toExponential(1) : value.toFixed(3)
}

function formatLuminanceStats(result: GainMapResult) {
  const { p50, p90, p95, p99, p99_9 } = result.stats.luminance
  return `p50 ${formatLinear(p50)} / p90 ${formatLinear(p90)} / p95 ${formatLinear(p95)} / p99 ${formatLinear(p99)} / p99.9 ${formatLinear(p99_9)}`
}

function formatGainStats(result: GainMapResult) {
  const { min, max, mean, encodedMin, encodedMax } = result.stats.gain
  return `log2 ${min.toFixed(2)}-${max.toFixed(2)} / mean ${mean.toFixed(2)} / encoded ${encodedMin}-${encodedMax}`
}

function presetTranslationKey(id: PresetId) {
  return `preset${id[0].toUpperCase()}${id.slice(1)}` as TranslationKey
}

function resolutionTranslationKey(mode: GainMapResolutionMode) {
  const keys: Record<GainMapResolutionMode, TranslationKey> = {
    auto: 'resolutionAuto',
    '480p': 'resolution480p',
    '720p': 'resolution720p',
    '1080p': 'resolution1080p',
    quarter: 'resolutionQuarter',
    half: 'resolutionHalf',
    full: 'resolutionFull',
    custom: 'resolutionCustom',
  }
  return keys[mode]
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
  if (message === 'Generating HDR gain map') return { key: 'statusGeneratingGainMap' }
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

function withSuffix(name: string, suffix: string) {
  const cleanName = name || 'luma-heic'
  const dot = cleanName.lastIndexOf('.')
  const stem = dot > 0 ? cleanName.slice(0, dot) : cleanName
  return `${stem}${suffix}`
}

export default App
