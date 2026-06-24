/** A pixel crop region as react-easy-crop reports it (croppedAreaPixels). */
export interface PixelCrop {
  x: number
  y: number
  width: number
  height: number
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('could not load image'))
    img.src = src
  })
}

/**
 * Draw `crop` (in source-image pixels) onto a square canvas of `size`px and export
 * a webp Blob. The web endpoint resizes to 256² regardless; we cap at 512 to keep
 * the IPC payload small while staying crisp on hi-dpi.
 */
export async function cropToWebp(src: string, crop: PixelCrop, size = 512): Promise<Blob> {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas unavailable')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, size, size)
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('could not render crop'))),
      'image/webp',
      0.9
    )
  )
}
