import { describe, expect, it } from 'vitest'
import { defaultBypassOptions, detectUsefulGain, generateBypassGainMap, type RgbaImage } from './gainMap'

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

it('keeps low luminance inputs effectively inactive', () => {
  const image = solid(8, 8, 12)
  const result = generateBypassGainMap(image, defaultBypassOptions)
  expect(result.stats.activePixels).toBe(0)
  expect(detectUsefulGain(image).isLowDynamicRange).toBe(true)
})

it('raises gain when highlights pass the threshold', () => {
  const dark = generateBypassGainMap(solid(8, 8, 64), defaultBypassOptions)
  const bright = generateBypassGainMap(solid(8, 8, 252), defaultBypassOptions)
  expect(bright.stats.meanGain).toBeGreaterThan(dark.stats.meanGain)
  expect(bright.stats.activePixels).toBe(64)
})

it('creates a quarter-resolution Apple-style gain map', () => {
  const result = generateBypassGainMap(solid(17, 19, 240), defaultBypassOptions)
  expect(result.gainMap.width).toBe(4)
  expect(result.gainMap.height).toBe(4)
  expect(result.gainMap.data).toHaveLength(16)
})

describe('option response', () => {
  it('reduces gain when threshold rises', () => {
    const image = solid(8, 8, 210)
    const lowThreshold = generateBypassGainMap(image, {
      ...defaultBypassOptions,
      threshold: 0.2,
    })
    const highThreshold = generateBypassGainMap(image, {
      ...defaultBypassOptions,
      threshold: 0.9,
    })
    expect(lowThreshold.stats.meanGain).toBeGreaterThan(highThreshold.stats.meanGain)
  })
})
