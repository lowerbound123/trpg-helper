import { reactive, type Ref } from 'vue'

import { fileUrl, readFileDataUrl, type LibraryIndex, type LibraryRecord } from '@/lib/backend'

export function useResourceImages(fallbackWidth: Ref<number>, fallbackHeight: Ref<number>) {
  const imageElements = reactive<Record<string, HTMLImageElement>>({})
  const previewUrls = reactive<Record<string, string>>({})

  function previewUrl(record: LibraryRecord) {
    return record.thumbnailPath ? fileUrl(record.thumbnailPath) : previewUrls[record.id] || fileUrl(record.path)
  }

  async function loadImage(record: LibraryRecord) {
    if (imageElements[record.id]) return imageElements[record.id]
    const image = new window.Image()
    image.crossOrigin = 'anonymous'
    const src = await readFileDataUrl(record.path, record.mediaType)
    previewUrls[record.id] = src
    await new Promise<void>((resolve, reject) => {
      image.onload = () => {
        imageElements[record.id] = image
        resolve()
      }
      image.onerror = () => reject(new Error(`Failed to load ${record.name}`))
      image.src = src
    })
    return image
  }

  function waitForIdle() {
    return new Promise<void>((resolve) => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => resolve(), { timeout: 250 })
        return
      }
      globalThis.setTimeout(resolve, 16)
    })
  }

  async function imageSize(record: LibraryRecord) {
    await loadImage(record)
    const image = imageElements[record.id]
    return {
      width: image?.naturalWidth || image?.width || fallbackWidth.value,
      height: image?.naturalHeight || image?.height || fallbackHeight.value,
    }
  }

  async function syncImages(library: LibraryIndex) {
    const records = [...library.backgrounds, ...library.assets]
    const results: PromiseSettledResult<HTMLImageElement>[] = []
    for (const record of records) {
      results.push(await loadImage(record)
        .then((value) => ({ status: 'fulfilled' as const, value }))
        .catch((reason) => ({ status: 'rejected' as const, reason })))
      if (results.length % 3 === 0) await waitForIdle()
    }
    return results
  }

  return {
    imageElements,
    imageSize,
    loadImage,
    previewUrl,
    syncImages,
  }
}
