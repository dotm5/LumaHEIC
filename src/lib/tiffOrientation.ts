/** Canvas affine matrix mapping raw TIFF pixels to EXIF-oriented pixels. */
export function tiffOrientationTransform(width: number, height: number, orientation: number) {
  const matrices: Record<number, [number, number, number, number, number, number]> = {
    1: [1, 0, 0, 1, 0, 0], 2: [-1, 0, 0, 1, width, 0],
    3: [-1, 0, 0, -1, width, height], 4: [1, 0, 0, -1, 0, height],
    5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, height, 0],
    7: [0, -1, -1, 0, height, width], 8: [0, -1, 1, 0, 0, width],
  }
  const normalized = matrices[orientation] ? orientation : 1
  return {
    width: normalized >= 5 ? height : width,
    height: normalized >= 5 ? width : height,
    matrix: matrices[normalized],
  }
}
