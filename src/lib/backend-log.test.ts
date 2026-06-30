import { describe, expect, it } from 'vitest'

import { logFileNameForScope } from './backend'

describe('debug log routing', () => {
  it('routes log scopes into logs/*.log files', () => {
    expect(logFileNameForScope('speed')).toBe('speed.log')
    expect(logFileNameForScope('mask')).toBe('mask.log')
    expect(logFileNameForScope('render')).toBe('render.log')
    expect(logFileNameForScope('export')).toBe('render.log')
    expect(logFileNameForScope('thumbnail')).toBe('render.log')
    expect(logFileNameForScope('background-render')).toBe('render.log')
    expect(logFileNameForScope('text')).toBe('text.log')
    expect(logFileNameForScope('app')).toBe('app.log')
    expect(logFileNameForScope('../bad scope')).toBe('app.log')
  })
})
