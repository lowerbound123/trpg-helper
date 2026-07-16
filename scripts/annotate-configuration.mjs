import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const configurationPath = resolve(projectRoot, 'configuration.toml')

const sectionNames = {
  application: '应用', window: '窗口', diagnostics: '诊断', paths: '路径', uploads: '上传',
  previews: '缩略图', finder: '文件管理器', editor: '编辑器', mask: '蒙版',
  foreground_segmentation: '前景分割', export: 'Handout 导出', debug: '调试', token: 'Token',
}

const terms = {
  candidates: '候选项', commit: '提交', compact: '紧凑视图', continuous: '连续', data: '数据', dir: '目录',
  edit: '编辑', grace: '宽限', grid: '网格', handout: 'Handout', idle: '空闲', locale: '界面语言',
  manager: '管理器', pixi: 'PixiJS', refresh: '刷新', screen: '屏幕', snap: '吸附', stroke: '笔触',
  threshold: '阈值', use: '使用', version: '版本',
  alpha: 'Alpha', antialias: '抗锯齿', backend: '后端', background: '背景', bytes: '字节',
  cache: '缓存', canvas: '画布', collision: '重名冲突', color: '颜色', contrast: '对比度',
  custom: '自定义', debounce: '防抖', decoding: '解码', default: '默认', defaults: '默认值',
  delay: '延迟', device: '设备', diagnostics: '诊断', dimension: '尺寸', directory: '目录',
  display: '显示', distance: '距离', download: '下载', edge: '边长', effort: '压缩强度',
  enabled: '启用', encoding: '编码', endpoint: '端点', export: '导出', file: '文件',
  finder: '文件管理器', font: '字体', format: '格式', formats: '格式列表', frontend: '前端',
  gap: '间隔', guide: '参考线', height: '高度', history: '历史', image: '图片',
  import: '导入', inner: '内侧', inter: '算子间', intra: '算子内', jpeg: 'JPEG',
  jxl: 'JXL', label: '名称', layout: '布局', length: '长度', level: '等级', limit: '限制',
  limits: '限制', line: '线条', log: '日志', lossless: '无损', mask: '蒙版', max: '最大',
  maximum: '最大', metadata: '元数据', method: '方法', min: '最小', minimum: '最小',
  model: '模型', naming: '命名', notifications: '通知', offset: '偏移', oklab: 'OKLab',
  opacity: '不透明度', optimization: '优化', outer: '外侧', output: '输出', palette: '调色板',
  passes: '遍数', path: '路径', pixels: '像素数', png: 'PNG', pointer: '指针', preserve: '保留',
  preview: '预览', previews: '预览', progressive: '渐进式', quality: '质量', radius: '半径',
  random: '随机', ratio: '比例', renderer: '渲染器', rendering: '渲染', request: '请求',
  resample: '重采样', resizable: '可调整大小', ring: '圆环', saturation: '饱和度', scale: '缩放',
  schema: '结构', separator: '分隔符', size: '尺寸', source: '源图片', speed: '速度',
  split: '分割', start: '起始值', step: '步长', stretch: '拉伸', style: '样式',
  suffix: '后缀', target: '目标', threads: '线程数', thumbnail: '缩略图', timeout: '超时',
  title: '标题', toast: '提示消息', transparent: '透明', trim: '裁切', upload: '上传',
  value: '数值', webp: 'WebP', width: '宽度', window: '窗口', worker: '任务 worker',
  world: '世界坐标', x: '横向', y: '纵向', zopfli: 'Zopfli',
}

function chineseName(key) {
  return key.split('_').map((part) => terms[part] || part.toUpperCase()).join(' ')
}

function sectionName(section) {
  return section.split('.').map((part) => sectionNames[part] || terms[part] || part).join(' / ')
}

function constraint(key, rawValue) {
  if (rawValue === 'true' || rawValue === 'false') return '取值：true 或 false'
  if (/color|palette/.test(key)) return '格式：十六进制颜色或颜色数组'
  if (/(_ms|delay|debounce)/.test(key)) return '单位：毫秒；范围：非负数'
  if (/timeout_seconds/.test(key)) return '单位：秒；范围：正整数'
  if (/(_bytes|file_size)/.test(key)) return '单位：字节或容量字符串；范围：正数'
  if (/(_px|width|height|size|radius|dimension|edge)/.test(key)) return '单位：像素；范围：按对应 limits 字段约束'
  if (/quality/.test(key)) return '单位：百分级质量；范围：按对应 limits 字段约束'
  if (/opacity|alpha/.test(key)) return '范围：0 到 1，或按字段定义的百分比'
  if (/threads|entries|passes|level|effort|speed|start/.test(key)) return '范围：非负整数或对应 limits 范围'
  if (/scale|ratio|distance|offset|stretch|angle/.test(key)) return '范围：按对应 limits 字段约束'
  if (rawValue.startsWith('[')) return '格式：TOML 数组'
  if (rawValue.startsWith('"')) return '格式：字符串或枚举值'
  return '范围：按该字段的业务约束'
}

function annotate(source) {
  let section = 'root'
  const output = []
  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith('# 配置项：')) continue
    const sectionMatch = line.match(/^\[\[?([^\]]+)\]\]?$/)
    if (sectionMatch) section = sectionMatch[1]
    const fieldMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/)
    if (fieldMatch) {
      const [, key, value] = fieldMatch
      output.push(`# 配置项：${sectionName(section)} / ${chineseName(key)}；用途：设置 ${sectionName(section)} 的${chineseName(key)}；${constraint(key, value)}；生效：保存并重启应用后。`)
    }
    output.push(line)
  }
  return `${output.join('\n').replace(/\n+$/, '')}\n`
}

const source = await readFile(configurationPath, 'utf8')
await writeFile(configurationPath, annotate(source), 'utf8')
