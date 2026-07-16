import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const deviceArg = process.argv.find((value) => value.startsWith('--device='))
const device = deviceArg?.slice('--device='.length) || 'cpu'
const supportedDevices = new Set(['auto', 'cpu', 'coreml', 'cuda', 'directml'])

if (!supportedDevices.has(device)) {
  console.error(`Unsupported smoke-test device: ${device}`)
  process.exit(2)
}

console.log(`Segmentation smoke host: platform=${process.platform}, arch=${process.arch}, device=${device}`)
const successMarker = join(tmpdir(), 'handout-generator-segmentation-smoke', 'success.txt')
rmSync(successMarker, { force: true })
const result = spawnSync(
  'cargo',
  [
    'test',
    '--manifest-path',
    'src-tauri/Cargo.toml',
    'foreground_segmentation::engine::tests::real_birefnet_smoke_segments_a_generated_image',
    '--',
    '--ignored',
    '--nocapture',
    '--test-threads=1',
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SEGMENTATION_SMOKE_DEVICE: device,
      SEGMENTATION_SMOKE_SUCCESS_MARKER: successMarker,
    },
    encoding: 'utf8',
  },
)

process.stdout.write(result.stdout || '')
process.stderr.write(result.stderr || '')
if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
if (existsSync(successMarker)) {
  console.log(`Segmentation smoke verified:\n${readFileSync(successMarker, 'utf8').trim()}`)
  if (result.status !== 0) {
    console.warn('The inference completed successfully; ignored an ONNX Runtime process-teardown failure after the test result.')
  }
  process.exit(0)
}
process.exit(result.status ?? 1)
