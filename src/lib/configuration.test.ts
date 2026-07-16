import { describe, expect, it } from 'vitest'

import { appConfiguration, configurationFromToml, parseConfigurationToml, serializeConfigurationToml } from './configuration'

describe('configuration', () => {
  it('parses simple TOML sections used by the app', () => {
    expect(parseConfigurationToml(`
      [finder]
      handout_grid_scale = 2
      enabled = true
      label = "Preview"
    `)).toEqual({
      finder: {
        handout_grid_scale: 2,
        enabled: true,
        label: 'Preview',
      },
    })
  })

  it('loads app configuration defaults from configuration.toml', () => {
    expect(appConfiguration.schemaVersion).toBe(1)
    expect(appConfiguration.application.title).toBe('Handout Generator')
    expect(appConfiguration.application.locale).toBe('auto')
    expect(appConfiguration.window.width).toBe(1440)
    expect(appConfiguration.finder.managerHeightPx).toBe(1080)
    expect(appConfiguration.finder.handoutGridScale).toBe(2)
    expect(appConfiguration.finder.backgroundGridScale).toBe(2)
    expect(appConfiguration.editor.continuousEditCommitDelayMs).toBeGreaterThan(0)
    expect(appConfiguration.mask.enabled).toBe(true)
    expect(appConfiguration.mask.usePixiPreview).toBe(true)
    expect(appConfiguration.mask.strokePreviewMinOpacity).toBe(0.3)
    expect(appConfiguration.mask.interactiveRefreshDelayMs).toBe(1000)
    expect(appConfiguration.mask.pointerIdleGraceMs).toBe(120)
    expect(appConfiguration.token.defaults.designSize).toBe(512)
    expect(appConfiguration.token.export.webpStrengthProfiles).toHaveLength(4)
    expect(appConfiguration.token.preview.renderer).toBe('webgl')
    expect(appConfiguration.token.layout.resizeHandleWidth).toBe(4)
    expect(appConfiguration.token.rings.backendCacheEntries).toBe(64)
    expect(appConfiguration.export.defaults.format).toBe('png')
    expect(appConfiguration.export.defaults.jxlEffort).toBe(7)
    expect(appConfiguration.export.rawRgbaIpcMaxBytes).toBe(134217728)
    expect(appConfiguration.export.limits.maxCanvasPixels).toBe(67108864)
    expect(appConfiguration.foregroundSegmentation).toEqual({
      enabled: true,
      model: 'birefnet-general',
      device: 'auto',
      workerThreads: 1,
      intraThreads: 0,
      interThreads: 1,
      downloadMissingModels: true,
      downloadTimeoutSeconds: 600,
      modelCacheDirectory: './models/foreground-segmentation',
      outputSuffix: '-foreground',
      maxSourceDimension: 16384,
      maxSourcePixels: 67108864,
    })
  })

  it('round-trips editable configuration fields', () => {
    const source = serializeConfigurationToml({
      ...appConfiguration,
      paths: { dataDir: './custom-data', logFile: './custom-log.txt' },
      mask: {
        enabled: false,
        usePixiPreview: false,
        strokePreviewMinOpacity: 0.45,
        interactiveRefreshDelayMs: 800,
        pointerIdleGraceMs: 90,
      },
      application: { title: 'Custom Generator', locale: 'en-US' },
      window: { ...appConfiguration.window, width: 1500 },
      diagnostics: { logDirectory: './custom-logs' },
      foregroundSegmentation: {
        ...appConfiguration.foregroundSegmentation,
        intraThreads: 4,
        outputSuffix: '-cutout',
      },
      export: {
        ...appConfiguration.export,
        defaultScale: 2,
        minScale: 0.2,
        defaults: { ...appConfiguration.export.defaults, format: 'jxl', jxlEffort: 8 },
      },
    })
    const parsed = configurationFromToml(source)
    expect(parsed.paths.dataDir).toBe('./custom-data')
    expect(parsed.paths.logFile).toBe('./custom-log.txt')
    expect(parsed.mask.enabled).toBe(false)
    expect(parsed.mask.usePixiPreview).toBe(false)
    expect(parsed.mask.strokePreviewMinOpacity).toBe(0.45)
    expect(parsed.mask.interactiveRefreshDelayMs).toBe(800)
    expect(parsed.mask.pointerIdleGraceMs).toBe(90)
    expect(parsed.export.defaultScale).toBe(2)
    expect(parsed.export.minScale).toBe(0.2)
    expect(parsed.export.defaults.format).toBe('jxl')
    expect(parsed.export.defaults.jxlEffort).toBe(8)
    expect(parsed.application.title).toBe('Custom Generator')
    expect(parsed.application.locale).toBe('en-US')
    expect(parsed.window.width).toBe(1500)
    expect(parsed.diagnostics.logDirectory).toBe('./custom-logs')
    expect(parsed.foregroundSegmentation.intraThreads).toBe(4)
    expect(parsed.foregroundSegmentation.outputSuffix).toBe('-cutout')
    expect(parsed.token.export.webpStrengthProfiles[1]?.id).toBe('balanced')
  })

  it('migrates legacy foreground segmentation fields to the new model and device settings', () => {
    const parsed = configurationFromToml(`
      [foreground_segmentation]
      enabled = true
      model_id = "birefnet-general"
      model_resource = "resources/models/BiRefNet-general-epoch_244.onnx"
      backend = "cpu"
      device_id = 0
      intra_threads = 2
      inter_threads = 1
      output_suffix = "-legacy"
      max_source_dimension = 4096
      max_source_pixels = 16000000
    `)
    expect(parsed.foregroundSegmentation).toMatchObject({
      model: 'birefnet-general',
      device: 'auto',
      workerThreads: 1,
      intraThreads: 2,
      downloadMissingModels: true,
      outputSuffix: '-legacy',
    })
  })

  it('round-trips nested token tables and arrays of tables', () => {
    const source = serializeConfigurationToml({
      ...appConfiguration,
      token: {
        ...appConfiguration.token,
        defaults: { ...appConfiguration.token.defaults, scale: 125 },
        export: {
          ...appConfiguration.token.export,
          webpStrengthProfiles: [{ id: 'custom', label: 'Custom', method: 6, passes: 4 }],
        },
      },
    })
    const parsed = configurationFromToml(source)
    expect(parsed.token.defaults.scale).toBe(125)
    expect(parsed.token.export.webpStrengthProfiles).toEqual([
      { id: 'custom', label: 'Custom', method: 6, passes: 4 },
    ])
  })
})
