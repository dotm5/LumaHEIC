export type BypassOptions = {
  intensity: number
  threshold: number
  softness: number
  headroom: number
  colorProtection: number
}

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

export const defaultBypassOptions: BypassOptions = {
  intensity: 0.72,
  threshold: 0.62,
  softness: 0.24,
  headroom: 3.0,
  colorProtection: 0.45,
}

const REC709_R = 0.2126
const REC709_G = 0.7152
const REC709_B = 0.0722

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

export function generateBypassGainMap(image: RgbaImage, options: BypassOptions): GainMapResult {
  const width = Math.max(1, Math.floor(image.width))
  const height = Math.max(1, Math.floor(image.height))
  const base = new Uint8ClampedArray(image.data)
  const fullGainLinear = new Float32Array(width * height)
  const hdrPreview = new Uint8ClampedArray(width * height * 4)
  let maxLuminance = 0
  let activePixels = 0
  let gainSum = 0

  const soft = clamp(options.softness, 0.01, 0.8)
  const threshold = clamp(options.threshold, 0.02, 0.98)
  const headroom = clamp(options.headroom, 1.05, 8)
  const intensity = clamp(options.intensity, 0, 1)
  const colorProtection = clamp(options.colorProtection, 0, 1)
  const headroomStops = Math.log2(headroom)

  for (let pixel = 0, i = 0; pixel < width * height; pixel++, i += 4) {
    const r = srgbToLinear(base[i])
    const g = srgbToLinear(base[i + 1])
    const b = srgbToLinear(base[i + 2])
    const luma = REC709_R * r + REC709_G * g + REC709_B * b
    maxLuminance = Math.max(maxLuminance, luma)

    const highlight = smoothstep(threshold - soft * 0.5, threshold + soft * 0.5, luma)
    const saturation = saturationProxy(r, g, b, luma)
    const chromaGuard = 1 - colorProtection * clamp(saturation * 0.85)
    const gain = clamp(highlight * intensity * chromaGuard)
    const boost = 1 + gain * (headroom - 1)

    fullGainLinear[pixel] = gain
    if (gain > 0.01) activePixels += 1
    gainSum += gain

    hdrPreview[i] = linearToSrgbByte(r * boost)
    hdrPreview[i + 1] = linearToSrgbByte(g * boost)
    hdrPreview[i + 2] = linearToSrgbByte(b * boost)
    hdrPreview[i + 3] = base[i + 3]
  }

  const gainMap = downsampleGainMap(fullGainLinear, width, height)
  const gainPreviewData = new Uint8ClampedArray(width * height * 4)

  for (let pixel = 0, i = 0; pixel < width * height; pixel++, i += 4) {
    const encoded = rec709EncodeByte(fullGainLinear[pixel])
    gainPreviewData[i] = encoded
    gainPreviewData[i + 1] = encoded
    gainPreviewData[i + 2] = encoded
    gainPreviewData[i + 3] = 255
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

export function downsampleGainMap(source: Float32Array, width: number, height: number) {
  const gainWidth = Math.max(1, Math.floor(width / 4))
  const gainHeight = Math.max(1, Math.floor(height / 4))
  const data = new Uint8Array(gainWidth * gainHeight)

  for (let y = 0; y < gainHeight; y++) {
    for (let x = 0; x < gainWidth; x++) {
      let sum = 0
      let samples = 0
      const startX = x * 4
      const startY = y * 4
      for (let oy = 0; oy < 4; oy++) {
        for (let ox = 0; ox < 4; ox++) {
          const sx = startX + ox
          const sy = startY + oy
          if (sx < width && sy < height) {
            sum += source[sy * width + sx]
            samples += 1
          }
        }
      }
      data[y * gainWidth + x] = rec709EncodeByte(sum / Math.max(samples, 1))
    }
  }

  return { width: gainWidth, height: gainHeight, data }
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
