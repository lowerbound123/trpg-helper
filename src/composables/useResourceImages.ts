import { reactive, type Ref } from 'vue'

import { fileUrl, readFileDataUrl, type LibraryIndex, type LibraryRecord } from '@/lib/backend'

export function useResourceImages(fallbackWidth: Ref<number>, fallbackHeight: Ref<number>) {
  const imageElements = reactive<Record<string, HTMLImageElement>>({})
  const previewUrls = reactive<Record<string, string>>({})

  function previewUrl(record: LibraryRecord) {
    return previewUrls[record.id] || fileUrl(record.path)
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

  async function imageSize(record: LibraryRecord) {
    await loadImage(record)
    const image = imageElements[record.id]
    return {
      width: image?.naturalWidth || image?.width || fallbackWidth.value,
      height: image?.naturalHeight || image?.height || fallbackHeight.value,
    }
  }

  function syncImages(library: LibraryIndex) {
    void Promise.all([...library.backgrounds, ...library.assets].map((record) => loadImage(record)))
  }

  return {
    imageElements,
    imageSize,
    previewUrl,
    syncImages,
  }
}
