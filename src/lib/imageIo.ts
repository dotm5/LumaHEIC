import type { RgbaImage } from './gainMap'

export async function decodeImageFile(file: File): Promise<RgbaImage> {
  if (!/^image\/(jpeg|png)$/.test(file.type) && !/\.(jpe?g|png)$/i.test(file.name)) {
    throw new Error('Only JPEG and PNG inputs are supported in bypass mode.')
  }

  const bitmap = await createBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', {
    colorSpace: 'display-p3',
    willReadFrequently: true,
  } as CanvasRenderingContext2DSettings)

  if (!ctx) throw new Error('Could not create a 2D canvas context.')
  ctx.drawImage(bitmap, 0, 0)
  if ('close' in bitmap) bitmap.close()

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return {
    width: canvas.width,
    height: canvas.height,
    data: imageData.data,
  }
}

async function createBitmap(file: File): Promise<ImageBitmap> {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file, {
      colorSpaceConversion: 'default',
      imageOrientation: 'from-image',
    })
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('Could not decode image.'))
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Could not create decode canvas.')
    ctx.drawImage(image, 0, 0)
    return createImageBitmap(canvas)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function imageToPngUrl(image: RgbaImage) {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create preview canvas.')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0)
  return canvas.toDataURL('image/png')
}
