import {
  defaultBypassOptions,
  type BypassOptions,
  type GainMapResolutionMode,
  type InputMode,
} from './authoring'

export { defaultBypassOptions }
export type { BypassOptions, GainMapResolutionMode, InputMode }

export type RgbaImage = {
  width: number
  height: number
  data: Uint8ClampedArray
}

export type GainMapResult = {
  base: RgbaImage
  gainMap: {
    width: number
    height: number
    data: Uint8Array
  }
  gainMapPreview: RgbaImage
  hdrPreview: RgbaImage
  stats: {
    maxLuminance: number
    meanGain: number
    activePixels: number
    headroomStops: number
  }
}

const REC709_R = 0.2126
const REC709_G = 0.7152
const REC709_B = 0.0722
const BASE_HIGHLIGHT_WEIGHT = 0.45
const BASE_WHITE_WEIGHT = 0.35

export function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / Math.max(edge1 - edge0, 1e-6))
  return t * t * (3 - 2 * t)
}

function srgbToLinear(value: number) {
  const v = value / 255
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
}

function linearToSrgbByte(value: number) {
  const v = clamp(value)
  const encoded = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055
  return Math.round(clamp(encoded) * 255)
}

function rec709EncodeByte(value: number) {
  const v = clamp(value)
  const encoded = v < 0.018 ? 4.5 * v : 1.099 * Math.pow(v, 0.45) - 0.099
  return Math.round(clamp(encoded) * 255)
}

function luminanceFromRgba(data: Uint8ClampedArray, index: number) {
  const r = srgbToLinear(data[index])
  const g = srgbToLinear(data[index + 1])
  const b = srgbToLinear(data[index + 2])
  return REC709_R * r + REC709_G * g + REC709_B * b
}

function saturationProxy(r: number, g: number, b: number, luma: number) {
  const maxChannel = Math.max(r, g, b)
  const minChannel = Math.min(r, g, b)
  return luma <= 1e-6 ? 0 : (maxChannel - minChannel) / Math.max(maxChannel, 1e-6)
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * clamp(t)
}

export function generateBypassGainMap(image: RgbaImage, options: BypassOptions): GainMapResult {
  const width = Math.max(1, Math.floor(image.width))
  const height = Math.max(1, Math.floor(image.height))
  const base = new Uint8ClampedArray(image.data)
  const fullGainLinear = new Float32Array(width * height)
  const hdrPreview = new Uint8ClampedArray(width * height * 4)
  let maxLuminance = 0
  let activePixels = 0
  let gainSum = 0

  const headroom = clamp(options.headroom, 1.05, 8)
  const strength = clamp(options.strength, 0, 1)
  const exposureGain = Math.pow(2, clamp(options.exposure, -2, 2))
  const glow = clamp(options.glow, 0, 1)
  const highlightStart = clamp(options.highlightStart - glow * 0.04, 0.02, 0.98)
  const highlightEnd = Math.max(highlightStart + 0.01, clamp(options.highlightEnd, 0.03, 1))
  const highlights = clamp(options.highlights, -1, 1)
  const whites = clamp(options.whites, -1, 1)
  const shadows = clamp(options.shadows, -1, 1)
  const blacks = clamp(options.blacks, -1, 1)
  const highlightWeight = clamp(
    BASE_HIGHLIGHT_WEIGHT +
      highlights * (highlights >= 0 ? 1 - BASE_HIGHLIGHT_WEIGHT : BASE_HIGHLIGHT_WEIGHT),
  )
  const whiteWeight = clamp(
    BASE_WHITE_WEIGHT + whites * (whites >= 0 ? 1 - BASE_WHITE_WEIGHT : BASE_WHITE_WEIGHT),
  )
  const shadowLiftWeight = Math.max(0, shadows) * 0.28
  const blackLiftWeight = Math.max(0, blacks) * 0.18
  const shadowProtect = clamp(options.shadowProtect, 0, 1)
  const saturationProtect = clamp(options.saturationProtect, 0, 1)
  const skinProtect = clamp(options.skinProtect, 0, 1)
  const headroomStops = Math.log2(headroom)

  for (let pixel = 0, i = 0; pixel < width * height; pixel++, i += 4) {
    const r = srgbToLinear(base[i])
    const g = srgbToLinear(base[i + 1])
    const b = srgbToLinear(base[i + 2])
    const luma = REC709_R * r + REC709_G * g + REC709_B * b
    maxLuminance = Math.max(maxLuminance, luma)

    const exposedLuma = clamp(luma * exposureGain)
    const highlight = smoothstep(highlightStart, highlightEnd, exposedLuma)
    const whitePoint = smoothstep(0.86, 0.995, exposedLuma)
    const shadowLift = smoothstep(0.08, 0.36, exposedLuma) * (1 - smoothstep(0.36, 0.72, exposedLuma))
    const blackRegion = 1 - smoothstep(0.015, 0.16, exposedLuma)
    const saturation = saturationProxy(r, g, b, luma)
    const chromaGuard = 1 - saturationProtect * clamp(saturation * 0.85)
    const shadowGuard = mix(1 - shadowProtect, 1, smoothstep(0.04, 0.45, exposedLuma))
    const shadowToneGuard =
      shadows < 0 ? mix(1 + shadows * 0.8, 1, smoothstep(0.08, 0.42, exposedLuma)) : 1
    const blackToneGuard =
      blacks < 0 ? mix(1 + blacks * 0.9, 1, smoothstep(0.015, 0.16, exposedLuma)) : 1
    const skinGuard = 1 - skinProtect * estimateSkinToneGuard(r, g, b, luma) * 0.45
    const gain = clamp(
      strength *
        (highlight * highlightWeight +
          whitePoint * whiteWeight * 0.8 +
          shadowLift * shadowLiftWeight +
          blackRegion * blackLiftWeight) *
        chromaGuard *
        shadowGuard *
        shadowToneGuard *
        blackToneGuard *
        skinGuard,
    )

    fullGainLinear[pixel] = gain
  }

  const finalGainLinear = diffuseGainMap(
    fullGainLinear,
    width,
    height,
    Math.round(clamp(options.edgeSmoothRadius, 0, 80)),
    glow,
  )

  const gainMap = downsampleGainMap(finalGainLinear, width, height, {
    mode: options.gainMapResolutionMode,
    smallHighlightPreserve: options.smallHighlightPreserve,
    customWidth: options.customGainMapWidth,
    customHeight: options.customGainMapHeight,
  })
  const gainPreviewData = new Uint8ClampedArray(width * height * 4)

  for (let pixel = 0, i = 0; pixel < width * height; pixel++, i += 4) {
    const gain = finalGainLinear[pixel]
    const encoded = rec709EncodeByte(gain)
    const boost = 1 + gain * (headroom - 1)
    const r = srgbToLinear(base[i])
    const g = srgbToLinear(base[i + 1])
    const b = srgbToLinear(base[i + 2])
    if (gain > 0.01) activePixels += 1
    gainSum += gain
    gainPreviewData[i] = encoded
    gainPreviewData[i + 1] = encoded
    gainPreviewData[i + 2] = encoded
    gainPreviewData[i + 3] = 255
    hdrPreview[i] = linearToSrgbByte(r * boost)
    hdrPreview[i + 1] = linearToSrgbByte(g * boost)
    hdrPreview[i + 2] = linearToSrgbByte(b * boost)
    hdrPreview[i + 3] = base[i + 3]
  }

  return {
    base: { width, height, data: base },
    gainMap,
    gainMapPreview: { width, height, data: gainPreviewData },
    hdrPreview: { width, height, data: hdrPreview },
    stats: {
      maxLuminance,
      meanGain: gainSum / Math.max(width * height, 1),
      activePixels,
      headroomStops,
    },
  }
}

type DownsampleOptions = {
  mode?: GainMapResolutionMode
  smallHighlightPreserve?: number
  customWidth?: number
  customHeight?: number
}

export function resolveGainMapSize(
  width: number,
  height: number,
  mode: GainMapResolutionMode = 'auto',
  customWidth?: number,
  customHeight?: number,
) {
  const sourceWidth = Math.max(1, Math.floor(width))
  const sourceHeight = Math.max(1, Math.floor(height))
  const longEdge = Math.max(sourceWidth, sourceHeight)

  if (mode === 'full') return { width: sourceWidth, height: sourceHeight }
  if (mode === 'half') return scaleByRatio(sourceWidth, sourceHeight, 0.5)
  if (mode === 'quarter') return scaleByRatio(sourceWidth, sourceHeight, 0.25)
  if (mode === 'custom' && customWidth && customHeight) {
    return clampSize(sourceWidth, sourceHeight, Math.floor(customWidth), Math.floor(customHeight))
  }

  const cap =
    mode === '480p'
      ? 480
      : mode === '720p'
        ? 720
        : mode === '1080p'
          ? 1080
          : longEdge <= 1200
            ? Math.floor(longEdge * 0.5)
            : longEdge <= 3000
              ? 720
              : longEdge <= 6000
                ? 1080
                : 1440

  return scaleToLongEdge(sourceWidth, sourceHeight, cap)
}

export function downsampleGainMap(
  source: Float32Array,
  width: number,
  height: number,
  options: DownsampleOptions = {},
) {
  const { width: gainWidth, height: gainHeight } = resolveGainMapSize(
    width,
    height,
    options.mode ?? 'quarter',
    options.customWidth,
    options.customHeight,
  )
  const data = new Uint8Array(gainWidth * gainHeight)
  const preserve = clamp(options.smallHighlightPreserve ?? 0)

  for (let y = 0; y < gainHeight; y++) {
    for (let x = 0; x < gainWidth; x++) {
      let sum = 0
      let samples = 0
      let maxGain = 0
      const startX = Math.floor((x * width) / gainWidth)
      const endX = Math.max(startX + 1, Math.floor(((x + 1) * width) / gainWidth))
      const startY = Math.floor((y * height) / gainHeight)
      const endY = Math.max(startY + 1, Math.floor(((y + 1) * height) / gainHeight))
      for (let sy = startY; sy < Math.min(endY, height); sy++) {
        for (let sx = startX; sx < Math.min(endX, width); sx++) {
          const value = source[sy * width + sx]
          sum += value
          maxGain = Math.max(maxGain, value)
          samples += 1
        }
      }
      const avgGain = sum / Math.max(samples, 1)
      const sparse = smoothstep(0.05, 0.35, maxGain - avgGain)
      const finalGain = mix(avgGain, maxGain, sparse * preserve)
      data[y * gainWidth + x] = rec709EncodeByte(finalGain)
    }
  }

  return { width: gainWidth, height: gainHeight, data }
}

export function authorBasePlusGainMap(
  baseImage: RgbaImage,
  gainMapImage: RgbaImage,
  options: BypassOptions,
): GainMapResult {
  const width = Math.max(1, Math.floor(baseImage.width))
  const height = Math.max(1, Math.floor(baseImage.height))
  const base = new Uint8ClampedArray(baseImage.data)
  const encodedFull = new Float32Array(width * height)
  const gainPreviewData = new Uint8ClampedArray(width * height * 4)
  const hdrPreview = new Uint8ClampedArray(width * height * 4)
  const headroom = clamp(options.headroom, 1.05, 8)
  const headroomStops = Math.log2(headroom)
  let activePixels = 0
  let gainSum = 0
  let maxLuminance = 0

  for (let pixel = 0, i = 0; pixel < width * height; pixel++, i += 4) {
    const x = pixel % width
    const y = Math.floor(pixel / width)
    const encoded = sampleEncodedGain(gainMapImage, x / width, y / height)
    const gain = encodedGainToMultiplier(encoded, headroom)
    encodedFull[pixel] = encoded
    if (encoded > 0.01) activePixels += 1
    gainSum += encoded

    const gray = rec709EncodeByte(encoded)
    gainPreviewData[i] = gray
    gainPreviewData[i + 1] = gray
    gainPreviewData[i + 2] = gray
    gainPreviewData[i + 3] = 255

    const r = srgbToLinear(base[i])
    const g = srgbToLinear(base[i + 1])
    const b = srgbToLinear(base[i + 2])
    maxLuminance = Math.max(maxLuminance, REC709_R * r + REC709_G * g + REC709_B * b)
    hdrPreview[i] = linearToSrgbByte(r * gain)
    hdrPreview[i + 1] = linearToSrgbByte(g * gain)
    hdrPreview[i + 2] = linearToSrgbByte(b * gain)
    hdrPreview[i + 3] = base[i + 3]
  }

  const gainMap = downsampleGainMap(encodedFull, width, height, {
    mode: options.gainMapResolutionMode,
    smallHighlightPreserve: options.smallHighlightPreserve,
    customWidth: options.customGainMapWidth,
    customHeight: options.customGainMapHeight,
  })

  return {
    base: { width, height, data: base },
    gainMap,
    gainMapPreview: { width, height, data: gainPreviewData },
    hdrPreview: { width, height, data: hdrPreview },
    stats: {
      maxLuminance,
      meanGain: gainSum / Math.max(width * height, 1),
      activePixels,
      headroomStops,
    },
  }
}

export function encodedGainToMultiplier(encoded: number, maxHeadroom: number) {
  return Math.pow(Math.max(maxHeadroom, 1.05), clamp(encoded))
}

export function gainMultiplierToEncoded(gain: number, maxHeadroom: number) {
  return clamp(Math.log2(Math.max(gain, 1)) / Math.log2(Math.max(maxHeadroom, 1.05)))
}

function diffuseGainMap(source: Float32Array, width: number, height: number, radius: number, amount: number) {
  const clampedAmount = clamp(amount)
  const clampedRadius = Math.max(0, Math.floor(radius))
  if (clampedAmount <= 0 || clampedRadius <= 0) return source

  const horizontal = new Float32Array(source.length)
  const blurred = new Float32Array(source.length)
  const rowPrefix = new Float32Array(width + 1)
  const columnPrefix = new Float32Array(height + 1)

  for (let y = 0; y < height; y++) {
    rowPrefix[0] = 0
    const rowOffset = y * width
    for (let x = 0; x < width; x++) {
      rowPrefix[x + 1] = rowPrefix[x] + source[rowOffset + x]
    }
    for (let x = 0; x < width; x++) {
      const start = Math.max(0, x - clampedRadius)
      const end = Math.min(width, x + clampedRadius + 1)
      horizontal[rowOffset + x] = (rowPrefix[end] - rowPrefix[start]) / Math.max(end - start, 1)
    }
  }

  for (let x = 0; x < width; x++) {
    columnPrefix[0] = 0
    for (let y = 0; y < height; y++) {
      columnPrefix[y + 1] = columnPrefix[y] + horizontal[y * width + x]
    }
    for (let y = 0; y < height; y++) {
      const start = Math.max(0, y - clampedRadius)
      const end = Math.min(height, y + clampedRadius + 1)
      blurred[y * width + x] = (columnPrefix[end] - columnPrefix[start]) / Math.max(end - start, 1)
    }
  }

  const result = new Float32Array(source.length)
  for (let i = 0; i < source.length; i++) {
    result[i] = clamp(Math.max(source[i], mix(source[i], blurred[i], clampedAmount)))
  }
  return result
}

function estimateSkinToneGuard(r: number, g: number, b: number, luma: number) {
  if (luma < 0.08 || luma > 0.86) return 0
  const warm = smoothstep(0.02, 0.18, r - b)
  const redAboveGreen = 1 - smoothstep(0.02, 0.22, Math.abs(r - g))
  const blueBelowGreen = smoothstep(0.0, 0.16, g - b)
  return clamp(warm * redAboveGreen * blueBelowGreen)
}

function scaleByRatio(width: number, height: number, ratio: number) {
  return {
    width: Math.max(1, Math.min(width, Math.floor(width * ratio))),
    height: Math.max(1, Math.min(height, Math.floor(height * ratio))),
  }
}

function scaleToLongEdge(width: number, height: number, targetLongEdge: number) {
  const longEdge = Math.max(width, height)
  const clampedLongEdge = Math.max(1, Math.min(longEdge, Math.floor(targetLongEdge)))
  if (clampedLongEdge >= longEdge) return { width, height }
  const ratio = clampedLongEdge / longEdge
  return scaleByRatio(width, height, ratio)
}

function clampSize(sourceWidth: number, sourceHeight: number, width: number, height: number) {
  return {
    width: Math.max(1, Math.min(sourceWidth, width)),
    height: Math.max(1, Math.min(sourceHeight, height)),
  }
}

function sampleEncodedGain(image: RgbaImage, normalizedX: number, normalizedY: number) {
  const x = Math.min(image.width - 1, Math.max(0, Math.floor(normalizedX * image.width)))
  const y = Math.min(image.height - 1, Math.max(0, Math.floor(normalizedY * image.height)))
  const index = (y * image.width + x) * 4
  return clamp(
    (REC709_R * image.data[index] + REC709_G * image.data[index + 1] + REC709_B * image.data[index + 2]) / 255,
  )
}

export function getAppleMakerNote48(headroom: number) {
  const stops = Math.log2(clamp(headroom, 1.05, 8))
  if (stops >= 2.3) return (3.0 - stops) / 70.0
  if (stops >= 1.8) return (2.30303 - stops) / 0.303
  if (stops >= 1.6) return (1.8 - stops) / 20.0
  return (1.60101 - stops) / 0.101
}

export function detectUsefulGain(image: RgbaImage) {
  let max = 0
  let sum = 0
  const pixels = image.width * image.height
  for (let pixel = 0, i = 0; pixel < pixels; pixel++, i += 4) {
    const luma = luminanceFromRgba(image.data, i)
    max = Math.max(max, luma)
    sum += luma
  }
  return {
    maxLuminance: max,
    meanLuminance: sum / Math.max(pixels, 1),
    isLowDynamicRange: max < 0.25,
  }
}
