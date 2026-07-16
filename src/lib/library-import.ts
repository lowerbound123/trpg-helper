import type { UploadKind } from './upload-validation'

export const LIBRARY_IMPORT_BATCH_MAX_BYTES = 64 * 1024 * 1024

export function partitionLibraryImportFiles(files: File[], maxBytes = LIBRARY_IMPORT_BATCH_MAX_BYTES) {
  const batches: File[][] = []
  let current: File[] = []
  let currentBytes = 0
  for (const file of files) {
    if (current.length && currentBytes + file.size > maxBytes) {
      batches.push(current)
      current = []
      currentBytes = 0
    }
    current.push(file)
    currentBytes += file.size
  }
  if (current.length) batches.push(current)
  return batches
}

export async function buildLibraryImportEnvelope(
  kind: UploadKind,
  files: File[],
  tags: string[],
  folder: string,
  clientIdOffset = 0,
) {
  const buffers = await Promise.all(files.map(async (file) => new Uint8Array(await file.arrayBuffer())))
  let offset = 0
  const metadataFiles = files.map((file, index) => {
    const length = buffers[index].length
    const entry = {
      clientId: String(clientIdOffset + index),
      fileName: file.name,
      mediaType: file.type || 'application/octet-stream',
      offset,
      length,
    }
    offset += length
    return entry
  })
  const header = new TextEncoder().encode(JSON.stringify({ kind, folder, tags, files: metadataFiles }))
  const envelope = new Uint8Array(8 + header.length + offset)
  envelope.set(new TextEncoder().encode('HGI1'), 0)
  new DataView(envelope.buffer).setUint32(4, header.length, true)
  envelope.set(header, 8)
  let payloadOffset = 8 + header.length
  for (const buffer of buffers) {
    envelope.set(buffer, payloadOffset)
    payloadOffset += buffer.length
  }
  return envelope
}
