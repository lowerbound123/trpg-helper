/** 将 512px Token 设计坐标投影到预览世界时使用的显示参考尺寸。 */
export let PREVIEW_DISPLAY_TOKEN_SIZE = 250

/** 预览取景范围的最小边长，确保普通 Token 周围保留稳定空间。 */
export let PREVIEW_MIN_WORLD_SIZE = 512

/** 预览取景范围的离散档位，避免小幅参数调整频繁改变摄像机比例。 */
export let PREVIEW_WORLD_SIZE_STEP = 128

export let PREVIEW_ANTIALIAS = true
export let PREVIEW_DPR_MAX = 2
export let PREVIEW_GUIDE = {
  dashLength: 6,
  gapLength: 4,
  lineWidth: 1,
  lineColor: '#FFFFFF',
  lineAlpha: 0.5,
  endpointRadius: 3,
  endpointAlpha: 0.7,
}

export function configurePreview(config: {
  displayTokenSize: number
  minimumWorldSize: number
  worldSizeStep: number
  antialias: boolean
  devicePixelRatioMax: number
  guide: typeof PREVIEW_GUIDE
}) {
  PREVIEW_DISPLAY_TOKEN_SIZE = config.displayTokenSize
  PREVIEW_MIN_WORLD_SIZE = config.minimumWorldSize
  PREVIEW_WORLD_SIZE_STEP = config.worldSizeStep
  PREVIEW_ANTIALIAS = config.antialias
  PREVIEW_DPR_MAX = config.devicePixelRatioMax
  PREVIEW_GUIDE = { ...config.guide }
}
