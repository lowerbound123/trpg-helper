import { describe, expect, it } from 'vitest'

import { filterRecords, foregroundSegmentationTargets } from './useFinderManagement'

const record = (name: string, folder: string, tags: string[] = []) => ({
  id: name, name, fileName: name, path: name, folder, tags, mediaType: 'image/png', createdAt: '', updatedAt: '',
})

describe('foregroundSegmentationTargets', () => {
  const image = { type: 'file', path: 'assets://__asset-a', mime_type: 'image/png' } as never
  const other = { type: 'file', path: 'assets://__asset-b', mime_type: 'image/png' } as never
  const directory = { type: 'dir', path: 'assets://folder', mime_type: null } as never

  it('returns all selected images when the context target belongs to the selection', () => {
    expect(foregroundSegmentationTargets(image, [image, other])).toEqual([image, other])
    expect(foregroundSegmentationTargets(directory, [directory])).toEqual([])
  })

  it('uses an unselected right-click target instead of an old multi-selection', () => {
    expect(foregroundSegmentationTargets(image, [other, directory])).toEqual([image])
  })
})

describe('filterRecords', () => {
  it('searches names and tags across all asset folders when a query is present', () => {
    const records = [record('root.png', ''), record('portrait.png', 'nested', ['hero'])]
    expect(filterRecords(records, 'hero', '').map((item) => item.name)).toEqual(['portrait.png'])
    expect(filterRecords(records, 'portrait', '').map((item) => item.name)).toEqual(['portrait.png'])
  })

  it('keeps folder scoping when there is no query', () => {
    const records = [record('root.png', ''), record('nested.png', 'nested')]
    expect(filterRecords(records, '', '').map((item) => item.name)).toEqual(['root.png'])
  })
})
