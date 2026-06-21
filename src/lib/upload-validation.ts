export type UploadKind = 'background' | 'asset' | 'font'

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/avif',
])

const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|webp|gif|bmp|tiff?|tga|avif|qoi|ico)$/i
const FONT_EXTENSION_PATTERN = /\.(ttf|otf|ttc|otc|woff2?)$/i

export function isSupportedUpload(kind: UploadKind, file: File) {
  if (kind === 'background' || kind === 'asset') {
    return SUPPORTED_IMAGE_MIME_TYPES.has(file.type) || IMAGE_EXTENSION_PATTERN.test(file.name)
  }
  return FONT_EXTENSION_PATTERN.test(file.name)
}

export function partitionUploadFiles(kind: UploadKind, files: File[]) {
  const accepted: File[] = []
  const rejected: File[] = []
  for (const file of files) {
    if (isSupportedUpload(kind, file)) accepted.push(file)
    else rejected.push(file)
  }
  return { accepted, rejected }
}
