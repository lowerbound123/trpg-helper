import { describe, expect, it } from 'vitest'
import viteConfig from '../../vite.config'

type CodeSplittingGroup = {
  name: string
  maxSize?: number
}

describe('build configuration', () => {
  it('keeps the prebundled VueFinder module in a single chunk', () => {
    const output = viteConfig.build?.rolldownOptions?.output as {
      codeSplitting?: { groups?: CodeSplittingGroup[] }
    }
    const finderGroup = output.codeSplitting?.groups?.find((group) => group.name === 'vendor-finder')

    expect(finderGroup).toBeDefined()
    expect(finderGroup?.maxSize).toBeUndefined()
  })
})
