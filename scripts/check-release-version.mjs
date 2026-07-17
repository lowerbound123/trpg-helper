import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const tauriConfig = JSON.parse(await readFile(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))
const cargoToml = await readFile(join(root, 'src-tauri', 'Cargo.toml'), 'utf8')
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
const expectedName = 'trpg-helper'
const versions = [packageJson.version, tauriConfig.version, cargoVersion]

if (packageJson.name !== expectedName) {
  throw new Error(`package.json name must be ${expectedName}, got ${packageJson.name}`)
}
if (tauriConfig.productName !== 'TRPG Helper') {
  throw new Error(`Tauri productName must be TRPG Helper, got ${tauriConfig.productName}`)
}
if (versions.some((version) => version !== versions[0])) {
  throw new Error(`Version mismatch: package=${versions[0]}, tauri=${versions[1]}, cargo=${versions[2]}`)
}

const releaseTag = process.env.RELEASE_TAG
if (releaseTag) {
  const [major, minor] = versions[0].split('.')
  const allowed = new Set([`v${versions[0]}`, `v${major}.${minor}`])
  if (!allowed.has(releaseTag)) {
    throw new Error(`Release tag ${releaseTag} does not match version ${versions[0]}`)
  }
}

process.stdout.write(`Release metadata is consistent for TRPG Helper ${versions[0]}.\n`)
