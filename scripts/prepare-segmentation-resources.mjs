import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, copyFile, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises'
import { homedir, platform, arch, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')
const manifestPath = join(scriptDir, 'segmentation-resources.lock.json')

function hostTriple() {
  const key = `${platform()}:${arch()}`
  const targets = {
    'darwin:arm64': 'aarch64-apple-darwin',
    'win32:x64': 'x86_64-pc-windows-msvc',
    'linux:x64': 'x86_64-unknown-linux-gnu',
  }
  return targets[key]
}

export function selectTargetTriple(args, environment = process.env, fallback = hostTriple()) {
  const targetIndex = args.indexOf('--target')
  if (targetIndex >= 0 && args[targetIndex + 1]) return args[targetIndex + 1]
  return environment.SEGMENTATION_TARGET || environment.TAURI_ENV_TARGET_TRIPLE || environment.CARGO_BUILD_TARGET || fallback
}

export function resourceForTarget(manifest, target) {
  const resource = manifest.targets[target]
  if (!resource) throw new Error(`Unsupported foreground segmentation target: ${target || 'unknown'}`)
  return resource
}

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

async function digest(path, algorithm) {
  const hash = createHash(algorithm)
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function download(url, target) {
  const partial = `${target}.partial`
  await rm(partial, { force: true })
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}): ${url}`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(partial))
  await rename(partial, target)
}

async function ensureDownload(spec, target, algorithm, expected) {
  if (await exists(target) && await digest(target, algorithm) === expected) return
  await mkdir(dirname(target), { recursive: true })
  await download(spec.url, target)
  const actual = await digest(target, algorithm)
  if (actual !== expected) {
    await rm(target, { force: true })
    throw new Error(`Checksum mismatch for ${basename(target)}: expected ${expected}, got ${actual}`)
  }
}

async function extractLibrary(archive, libraryFile, output) {
  const temporary = await mkdtemp(join(tmpdir(), 'handout-ort-'))
  try {
    const result = spawnSync('tar', ['-xf', archive, '-C', temporary], { stdio: 'inherit' })
    if (result.status !== 0) throw new Error(`Failed to extract ${basename(archive)}`)
    const source = join(temporary, libraryFile)
    if (!await exists(source)) throw new Error(`ONNX Runtime archive is missing ${libraryFile}`)
    await mkdir(dirname(output), { recursive: true })
    await copyFile(source, output)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

export async function prepareSegmentationResources(args = process.argv.slice(2), environment = process.env) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const target = selectTargetTriple(args, environment)
  const runtime = resourceForTarget(manifest, target)
  const cacheDirectory = environment.TRPG_HELPER_SEGMENTATION_CACHE_DIR
    || environment.HANDOUT_SEGMENTATION_CACHE_DIR
  const cacheRoot = cacheDirectory
    ? resolve(cacheDirectory)
    : join(homedir(), '.cache', 'trpg-helper', 'segmentation-resources')
  const archiveCache = join(cacheRoot, runtime.archive)
  const runtimeOutput = join(projectRoot, 'src-tauri', 'resources', 'onnxruntime', target, basename(runtime.libraryFile))

  await ensureDownload(runtime, archiveCache, 'sha256', runtime.sha256)
  if (!await exists(runtimeOutput)) await extractLibrary(archiveCache, runtime.libraryFile, runtimeOutput)
  return { target, runtimeOutput }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareSegmentationResources()
    .then(({ target }) => process.stdout.write(`Foreground segmentation resources ready for ${target}.\n`))
    .catch((error) => { process.stderr.write(`${String(error)}\n`); process.exitCode = 1 })
}
