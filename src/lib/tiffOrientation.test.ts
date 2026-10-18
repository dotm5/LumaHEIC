import { describe, expect, it } from 'vitest'
import { tiffOrientationTransform } from './tiffOrientation'

describe('TIFF pixel orientation', () => {
  // Locations of raw top-left, top-right, bottom-right, bottom-left pixel corners.
  const expected = [
    [[0, 0], [3, 0], [3, 2], [0, 2]], [[3, 0], [0, 0], [0, 2], [3, 2]],
    [[3, 2], [0, 2], [0, 0], [3, 0]], [[0, 2], [3, 2], [3, 0], [0, 0]],
    [[0, 0], [0, 3], [2, 3], [2, 0]], [[2, 0], [2, 3], [0, 3], [0, 0]],
    [[2, 3], [2, 0], [0, 0], [0, 3]], [[0, 3], [0, 0], [2, 0], [2, 3]],
  ]
  for (let orientation = 1; orientation <= 8; orientation++) {
    it(`applies orientation ${orientation} exactly once before export normalization`, () => {
      const { width, height, matrix: [a, b, c, d, e, f] } = tiffOrientationTransform(3, 2, orientation)
      expect([width, height]).toEqual(orientation >= 5 ? [2, 3] : [3, 2])
      expect([[0, 0], [3, 0], [3, 2], [0, 2]].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f])).toEqual(expected[orientation - 1])
    })
  }
  it('defaults invalid orientation to top-left', () => {
    expect(tiffOrientationTransform(3, 2, 0)).toEqual(tiffOrientationTransform(3, 2, 1))
  })
})
