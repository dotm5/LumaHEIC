import type { RgbaImage } from '../../lib/gainMap'

export function renderRgbaPreview(canvas: HTMLCanvasElement, image: RgbaImage) {
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create preview canvas.')
  ctx.putImageData(new ImageData(image.data as ImageDataArray, image.width, image.height), 0, 0)
}
