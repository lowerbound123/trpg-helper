import { describe, expect, it } from 'vitest'
import type { DirEntry } from 'vuefinder'

import type { LibraryRecord } from '@/lib/backend'
import { collectImageAssetsForFinderEntries } from './useFinderManagement'

function asset(id: string, folder: string, mediaType = 'image/png'): LibraryRecord {
  return {
    id,
    name: `${id}.png`,
    fileName: `${id}.png`,
    path: `/assets/${folder}/${id}.png`,
    folder,
    tags: [],
    mediaType,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }
}

function entry(path: string, type: 'file' | 'dir'): DirEntry {
  return {
    dir: 'assets://', basename: path.split('/').at(-1) || '', extension: '', path,
    storage: 'assets', type, file_size: null, last_modified: null, mime_type: null,
    visibility: 'public',
  }
}

describe('Token asset finder collection', () => {
  it('recursively collects image files from folders and deduplicates explicit files', () => {
    const records = [
      asset('root', ''),
      asset('one', 'portraits'),
      asset('two', 'portraits/npcs'),
      asset('text', 'portraits', 'text/plain'),
    ]

    const result = collectImageAssetsForFinderEntries(
      [entry('assets://portraits', 'dir'), entry('assets://portraits/__asset-one', 'file')],
      records,
    )

    expect(result.map((record) => record.id)).toEqual(['one', 'two'])
  })
})
