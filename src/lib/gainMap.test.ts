import { describe, expect, it } from 'vitest'
import { defaultBypassOptions, defaultPresetId, hdrPresets } from './authoring'
import {
  authorBasePlusGainMap,
  detectUsefulGain,
  downsampleGainMap,
  encodedGainToMultiplier,
  gainMultiplierToEncoded,
  generateBypassGainMap,
  resolveGainMapSize,
  type RgbaImage,
} from './gainMap'

function solid(width: number, height: number, value: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }
  return { width, height, data }
}

function grayscale(width: number, height: number, values: number[]): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let pixel = 0, i = 0; pixel < width * height; pixel++, i += 4) {
    const value = values[pixel] ?? 0
    data[i] = value
    data[i + 1] = value
    data[i + 2] = value
    data[i + 3] = 255
  }
  return { width, height, data }
}

describe('presets', () => {
  it('uses Natural as the conservative default preset', () => {
    expect(defaultPresetId).toBe('natural')
    expect(defaultBypassOptions).toEqual(hdrPresets.natural)
    expect(defaultBypassOptions.headroom).toBeLessThanOrEqual(3)
    expect(defaultBypassOptions.strength).toBeLessThanOrEqual(0.65)
    expect(defaultBypassOptions.gainMapResolutionMode).toBe('auto')
  })

  it('switches to visibly different strength and headroom values', () => {
    expect(hdrPresets.bright.headroom).toBeGreaterThan(hdrPresets.natural.headroom)
    expect(hdrPresets.bright.strength).toBeGreaterThan(hdrPresets.natural.strength)
    expect(hdrPresets.extreme.headroom).toBeGreaterThan(hdrPresets.bright.headroom)
    expect(hdrPresets.extreme.strength).toBeGreaterThan(hdrPresets.bright.strength)
  })
})

describe('gain map generation', () => {
  it('keeps low luminance inputs effectively inactive', () => {
    const image = solid(8, 8, 12)
    const result = generateBypassGainMap(image, defaultBypassOptions)
    expect(result.stats.activePixels).toBe(0)
    expect(detectUsefulGain(image).isLowDynamicRange).toBe(true)
  })

  it('raises gain when highlights pass the highlight range', () => {
    const dark = generateBypassGainMap(solid(8, 8, 64), defaultBypassOptions)
    const bright = generateBypassGainMap(solid(8, 8, 252), defaultBypassOptions)
    expect(bright.stats.meanGain).toBeGreaterThan(dark.stats.meanGain)
    expect(bright.stats.activePixels).toBe(64)
  })
})

describe('gain map resolution', () => {
  it('chooses 1080 long edge for 4000x3000 auto', () => {
    expect(resolveGainMapSize(4000, 3000, 'auto')).toEqual({ width: 1080, height: 810 })
  })

  it('caps 1920x1080 480p output to a 480 long edge', () => {
    const size = resolveGainMapSize(1920, 1080, '480p')
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(480)
    expect(size).toEqual({ width: 480, height: 270 })
  })

  it('uses one quarter of the original dimensions', () => {
    expect(resolveGainMapSize(1920, 1080, 'quarter')).toEqual({ width: 480, height: 270 })
  })

  it('never exceeds the original image dimensions', () => {
    for (const mode of ['auto', '480p', '720p', '1080p', 'quarter', 'half', 'full'] as const) {
      const size = resolveGainMapSize(320, 200, mode)
      expect(size.width).toBeLessThanOrEqual(320)
      expect(size.height).toBeLessThanOrEqual(200)
      expect(size.width).toBeGreaterThanOrEqual(1)
      expect(size.height).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('downsample preservation', () => {
  it('keeps sparse highlights above pure average when preservation is enabled', () => {
    const source = new Float32Array(16 * 16)
    source[0] = 1
    const averaged = downsampleGainMap(source, 16, 16, {
      mode: 'quarter',
      smallHighlightPreserve: 0,
    })
    const preserved = downsampleGainMap(source, 16, 16, {
      mode: 'quarter',
      smallHighlightPreserve: 1,
    })
    expect(preserved.data[0]).toBeGreaterThan(averaged.data[0])
  })
})

describe('Base + Gain Map authoring', () => {
  it('interprets black as 1x gain and white as max headroom', () => {
    const maxHeadroom = 4
    expect(encodedGainToMultiplier(0, maxHeadroom)).toBeCloseTo(1)
    expect(encodedGainToMultiplier(1, maxHeadroom)).toBeCloseTo(maxHeadroom)
  })

  it('uses log2 gain encoding for middle gray values', () => {
    const maxHeadroom = 4
    expect(gainMultiplierToEncoded(2, maxHeadroom)).toBeCloseTo(0.5)
    expect(encodedGainToMultiplier(0.5, maxHeadroom)).toBeCloseTo(2)
  })

  it('packages an uploaded grayscale gain map as encoded luma', () => {
    const result = authorBasePlusGainMap(solid(2, 1, 120), grayscale(2, 1, [0, 255]), {
      ...defaultBypassOptions,
      headroom: 4,
      gainMapResolutionMode: 'full',
      smallHighlightPreserve: 0,
    })

    expect(result.gainMap.width).toBe(2)
    expect(result.gainMap.height).toBe(1)
    expect(result.gainMap.data[0]).toBe(0)
    expect(result.gainMap.data[1]).toBe(255)
  })
})
