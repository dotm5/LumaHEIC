import { describe, expect, it } from 'vitest'
import { downsampleRgbaImage, resolvePreviewSize } from './downsampleRgba'
import type { RgbaImage } from '../../lib/gainMap'

function testImage(width: number, height: number): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let pixel = 0, i = 0; pixel < width * height; pixel++, i += 4) {
    data[i] = pixel
    data[i + 1] = pixel + 1
    data[i + 2] = pixel + 2
    data[i + 3] = 255
  }
  return { width, height, data }
}

describe('preview RGBA downsampling', () => {
  it('preserves aspect ratio under a max long edge', () => {
    expect(resolvePreviewSize(4000, 3000, 480)).toEqual({ width: 480, height: 360 })
    expect(resolvePreviewSize(3000, 4000, 480)).toEqual({ width: 360, height: 480 })
  })

  it('returns a cloned image when no scaling is needed', () => {
    const image = testImage(2, 2)
    const preview = downsampleRgbaImage(image, 480)

    expect(preview).toEqual(image)
    expect(preview.data).not.toBe(image.data)
  })

  it('samples RGBA pixels into the target preview buffer', () => {
    const preview = downsampleRgbaImage(testImage(4, 2), 2)

    expect(preview.width).toBe(2)
    expect(preview.height).toBe(1)
    expect(Array.from(preview.data.slice(0, 8))).toEqual([0, 1, 2, 255, 2, 3, 4, 255])
  })
})
