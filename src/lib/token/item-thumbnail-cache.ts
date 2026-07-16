import { fileUrl } from '@/lib/backend'

const cache = new Map<string, Promise<string>>()
const MAX_ENTRIES = 64

function remember(path: string, value: Promise<string>) {
  cache.delete(path)
  cache.set(path, value)
  while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string)
  return value
}

export function loadTokenItemThumbnail(path: string, size = 96): Promise<string> {
  const existing = cache.get(path)
  if (existing) return remember(path, existing)
  const loading = new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const context = canvas.getContext('2d')
      if (!context) return reject(new Error('无法创建 Token 列表缩略图'))
      const scale = Math.min(size / image.naturalWidth, size / image.naturalHeight)
      const width = image.naturalWidth * scale
      const height = image.naturalHeight * scale
      context.drawImage(image, (size - width) / 2, (size - height) / 2, width, height)
      resolve(canvas.toDataURL('image/webp', 0.75))
    }
    image.onerror = () => reject(new Error('Token 列表图片加载失败'))
    image.src = fileUrl(path)
  }).catch((error) => {
    cache.delete(path)
    throw error
  })
  return remember(path, loading)
}

export function clearTokenItemThumbnailCache(paths?: ReadonlySet<string>) {
  if (!paths) return cache.clear()
  for (const path of cache.keys()) if (!paths.has(path)) cache.delete(path)
}
