import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '../..')

function read(path: string): string {
  return readFileSync(resolve(root, path), 'utf8')
}

describe('public release configuration', () => {
  it('keeps product names and versions aligned', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      name: string
      version: string
      license: string
      repository: string
    }
    const tauri = JSON.parse(read('src-tauri/tauri.conf.json')) as {
      productName: string
      version: string
      identifier: string
    }
    const cargo = read('src-tauri/Cargo.toml')

    expect(packageJson).toMatchObject({
      name: 'trpg-helper',
      version: '1.0.0',
      license: 'GPL-3.0-only',
      repository: 'https://github.com/lowerbound123/trpg-helper',
    })
    expect(tauri).toMatchObject({
      productName: 'TRPG Helper',
      version: '1.0.0',
      identifier: 'com.tonychow.trpghelper',
    })
    expect(cargo).toContain('name = "trpg-helper"')
    expect(cargo).toContain('version = "1.0.0"')
    expect(cargo).toContain('license = "GPL-3.0-only"')
  })

  it('uses a restrictive CSP without machine-specific asset paths', () => {
    const tauriText = read('src-tauri/tauri.conf.json')
    const tauri = JSON.parse(tauriText) as {
      app: { security: { csp: string; assetProtocol: { scope: string[] } } }
      bundle: { targets?: string | string[] }
    }

    expect(tauri.app.security.csp).toContain("default-src 'self'")
    expect(tauri.app.security.assetProtocol.scope).toEqual([])
    expect(tauri.bundle.targets).not.toBe('all')
    expect(tauriText).not.toContain('/Users/')
    expect(tauriText).not.toContain('/Volumes/')
  })

  it('keeps CI and release workflows complete', () => {
    const ci = read('.github/workflows/ci.yml')
    const release = read('.github/workflows/release.yml')

    for (const command of [
      'pnpm install --frozen-lockfile',
      'pnpm exec vitest run',
      'pnpm run typecheck',
      'pnpm run build',
      'cargo fmt',
      'cargo clippy',
      'cargo test',
    ]) {
      expect(ci).toContain(command)
    }

    expect(release).toContain('aarch64-apple-darwin')
    expect(release).toContain('x86_64-pc-windows-msvc')
    expect(release).toContain('x86_64-unknown-linux-gnu')
    expect(release).toContain('bundles: dmg')
    expect(release).toContain('bundles: nsis')
    expect(release).toContain('bundles: appimage')
    expect(release).toContain('--bundles ${{ matrix.bundles }}')
    expect(release).toContain('releaseDraft: true')
    expect(release).toContain('tauri-apps/tauri-action@v1')
  })

  it('documents unsigned packages, runtime data, and model downloads', () => {
    const readme = read('README.md')

    expect(readme).toContain('GNU General Public License v3.0 only')
    expect(readme).toContain('unsigned')
    expect(readme).toContain('~/Documents/trpg-helper')
    expect(readme).toContain('runtime')
    expect(readme).toContain('BiRefNet')
  })
})
