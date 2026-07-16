import { readdirSync, readFileSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'
import { enUSMessages } from './en-US'

const sourceRoot = join(process.cwd(), 'src')
const componentsRoot = join(process.cwd(), 'src/components')

function collectVueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return collectVueFiles(path)
    return extname(entry.name) === '.vue' ? [path] : []
  })
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return entry.name === 'i18n' ? [] : collectSourceFiles(path)
    return ['.ts', '.vue'].includes(extname(entry.name)) && !entry.name.endsWith('.test.ts') ? [path] : []
  })
}

function templateSource(source: string) {
  const match = source.match(/<template(?:\s[^>]*)?>([\s\S]*?)<\/template>/)
  return match?.[1] ?? ''
}

function lineNumber(source: string, index: number) {
  return source.slice(0, index).split('\n').length
}

describe('UI source localization', () => {
  it('does not leave Chinese copy directly in Vue templates', () => {
    const violations = collectVueFiles(componentsRoot).flatMap((file) => {
      const template = templateSource(readFileSync(file, 'utf8'))
      return [...template.matchAll(/[\u3400-\u9fff]+/g)].map((match) =>
        `${relative(process.cwd(), file)}:${lineNumber(template, match.index ?? 0)} ${match[0]}`,
      )
    })

    expect(violations).toEqual([])
  })

  it('does not leave static user-facing attributes in Vue templates', () => {
    const violations = collectVueFiles(componentsRoot).flatMap((file) => {
      const template = templateSource(readFileSync(file, 'utf8'))
      const pattern = /\s(?:title|placeholder|aria-label|description)="([^":][^"]*)"/g
      return [...template.matchAll(pattern)].map((match) =>
        `${relative(process.cwd(), file)}:${lineNumber(template, match.index ?? 0)} ${match[0].trim()}`,
      )
    })

    expect(violations).toEqual([])
  })

  it('only references translation keys that exist in the catalog', () => {
    const catalog = new Set(Object.keys(enUSMessages))
    const violations = collectSourceFiles(sourceRoot).flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      const pattern = /(?:\$?t|translate)\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g
      return [...source.matchAll(pattern)]
        .filter((match) => !catalog.has(match[1]!))
        .map((match) => `${relative(process.cwd(), file)}:${lineNumber(source, match.index ?? 0)} ${match[1]}`)
    })

    expect(violations).toEqual([])
  })
})
