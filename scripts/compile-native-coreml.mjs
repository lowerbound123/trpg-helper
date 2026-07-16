import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

const MODELS = {
  'birefnet-general': {
    revision: 'epoch-244',
    referenceOnnxSha256: '58f621f00f5d756097615970a88a791584600dcf7c45b18a0a6267535a1ebd3c',
    inputSize: 1024,
  },
  u2net: {
    revision: '7fc34deee10329bc039c10a73b98090d0c6f5c59',
    referenceOnnxSha256: '8d10d2f3bb75ae3b6d527c77944fc5e7dcd94b29809d47a739a7a728a912b491',
    inputSize: 320,
  },
  ben2: {
    revision: 'e48a20765fb421d19dcdb0bf3cc61e802ca5ec8f',
    referenceOnnxSha256: '22cea62108ff53b7ccc20f7a008bf30494228d84b1687f29ecbe76936a998101',
    inputSize: 1024,
  },
}

function argument(name, fallback) {
  const prefix = `--${name}=`
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback
}

if (process.platform !== 'darwin') {
  throw new Error('原生 CoreML 编译只支持 macOS')
}

const modelId = argument('model', 'birefnet-general')
const model = MODELS[modelId]
if (!model) {
  throw new Error(`不支持的前景分割模型: ${modelId}`)
}
const sourceArgument = argument('source')
if (!sourceArgument) {
  throw new Error('缺少 --source=/path/to/model.mlmodel 或 .mlpackage')
}
const source = resolve(sourceArgument)
if (!existsSync(source) || !['.mlmodel', '.mlpackage'].some((suffix) => source.endsWith(suffix))) {
  throw new Error(`CoreML 源模型不存在或格式无效: ${source}`)
}

const inputName = argument('input-name', 'input')
const outputName = argument('output-name', 'output')
const cacheRoot = resolve(
  argument(
    'cache-root',
    join(homedir(), 'Documents/trpg-helper/models/foreground-segmentation'),
  ),
)
const destination = join(cacheRoot, modelId, model.revision, 'native-coreml')
const parent = dirname(destination)
const staging = join(parent, `.native-coreml-${process.pid}.partial`)
rmSync(staging, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })

console.log(`[coreml] 编译 ${basename(source)} -> 单一 mlmodelc`)
const result = spawnSync(
  'xcrun',
  ['coremlcompiler', 'compile', source, staging, '--platform', 'macOS'],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
)
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
if (result.status !== 0) {
  rmSync(staging, { recursive: true, force: true })
  throw new Error(`coremlcompiler 失败，退出码 ${result.status ?? 'unknown'}`)
}

const compiledName = readdirSync(staging).find((name) => name.endsWith('.mlmodelc'))
if (!compiledName) {
  rmSync(staging, { recursive: true, force: true })
  throw new Error('coremlcompiler 未生成 mlmodelc')
}
renameSync(join(staging, compiledName), join(staging, 'model.mlmodelc'))
writeFileSync(
  join(staging, 'manifest.json'),
  `${JSON.stringify(
    {
      schemaVersion: 1,
      modelId,
      revision: model.revision,
      referenceOnnxSha256: model.referenceOnnxSha256,
      inputName,
      outputName,
      inputSize: model.inputSize,
    },
    null,
    2,
  )}\n`,
)
const backup = `${destination}.backup`
rmSync(backup, { recursive: true, force: true })
if (existsSync(destination)) renameSync(destination, backup)
try {
  renameSync(staging, destination)
  rmSync(backup, { recursive: true, force: true })
} catch (error) {
  if (existsSync(backup) && !existsSync(destination)) renameSync(backup, destination)
  throw error
}
console.log(`[coreml] 已持久化 ${join(destination, 'model.mlmodelc')}`)
