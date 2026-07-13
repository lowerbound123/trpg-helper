import {
  Application,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
  type ApplicationOptions,
  type FederatedPointerEvent,
} from 'pixi.js'

import { TOKEN_SCALE_MAX, TOKEN_SCALE_MIN, TOKEN_SCALE_WHEEL_STEP, type TokenParams } from '../types'
import {
  calculateAvatarLayout,
  calculateCustomRingLayout,
  calculateGuideSegment,
  calculateHalfPlanePolygon,
  calculatePreviewCameraTransform,
  calculatePreviewWorldSize,
  offsetFromDragDelta,
  parseRgbaHex,
} from './geometry'
import type { PreviewImageSource } from './imageLoader'
import {
  PREVIEW_ANTIALIAS,
  PREVIEW_DISPLAY_TOKEN_SIZE,
  PREVIEW_DPR_MAX,
  PREVIEW_GUIDE,
  PREVIEW_MIN_WORLD_SIZE,
} from './config'

export interface PreviewInteractionHandlers {
  onOffsetChange(offsetX: number, offsetY: number): void
  onOffsetCommit(): void
  onScaleChange(scale: number): void
}

export type PreviewRendererPreference = 'webgl' | 'webgpu'

export function createPixiApplicationOptions(
  width: number,
  height: number,
  pixelRatio: number,
  preference: PreviewRendererPreference = 'webgl',
): Partial<ApplicationOptions> {
  return {
    width,
    height,
    preference,
    backgroundAlpha: 0,
    antialias: PREVIEW_ANTIALIAS,
    resolution: Math.min(Math.max(pixelRatio, 1), PREVIEW_DPR_MAX),
    autoDensity: true,
    autoStart: false,
  }
}

function drawMaskPolygon(graphics: Graphics, points: number[]): void {
  graphics.clear().poly(points).fill(0xffffff)
}

function drawFullMask(graphics: Graphics, size: number): void {
  graphics.clear().rect(0, 0, size, size).fill(0xffffff)
}

function drawCircleMask(graphics: Graphics, center: number, radius: number): void {
  graphics.clear().circle(center, center, Math.max(radius, 0)).fill(0xffffff)
}

function drawDashedGuide(
  graphics: Graphics,
  start: { x: number; y: number },
  end: { x: number; y: number },
): void {
  graphics.clear()
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return

  const unitX = dx / length
  const unitY = dy / length
  const dashLength = PREVIEW_GUIDE.dashLength
  const gapLength = PREVIEW_GUIDE.gapLength

  for (let offset = 0; offset < length; offset += dashLength + gapLength) {
    const dashEnd = Math.min(offset + dashLength, length)
    graphics
      .moveTo(start.x + unitX * offset, start.y + unitY * offset)
      .lineTo(start.x + unitX * dashEnd, start.y + unitY * dashEnd)
  }
  const guideColor = parseRgbaHex(PREVIEW_GUIDE.lineColor)
  graphics.stroke({
    color: guideColor.color,
    alpha: PREVIEW_GUIDE.lineAlpha,
    width: PREVIEW_GUIDE.lineWidth,
  })
  graphics
    .circle(start.x, start.y, PREVIEW_GUIDE.endpointRadius)
    .circle(end.x, end.y, PREVIEW_GUIDE.endpointRadius)
    .fill({
      color: guideColor.color,
      alpha: PREVIEW_GUIDE.endpointAlpha,
    })
}

export interface PreviewScene {
  root: Container
  background: Graphics
  ringBackContainer: Container
  ringBackBandContainer: Container
  ringBack: Graphics
  ringBackSprite: Sprite
  ringBackMask: Graphics
  ringBackBandMask: Graphics
  avatarNonSplitContainer: Container
  avatarNonSplit: Sprite
  avatarNonSplitMask: Graphics
  avatarAllowedContainer: Container
  avatarAllowed: Sprite
  avatarAllowedMask: Graphics
  avatarRestrictedOuter: Container
  avatarRestrictedInner: Container
  avatarRestricted: Sprite
  avatarRestrictedCircleMask: Graphics
  avatarRestrictedHalfMask: Graphics
  ringFrontContainer: Container
  ringFrontBandContainer: Container
  ringFront: Graphics
  ringFrontSprite: Sprite
  ringFrontMask: Graphics
  ringFrontBandMask: Graphics
  guide: Graphics
}

export function createPreviewScene(): PreviewScene {
  const scene: PreviewScene = {
    root: new Container(),
    background: new Graphics(),
    ringBackContainer: new Container(),
    ringBackBandContainer: new Container(),
    ringBack: new Graphics(),
    ringBackSprite: new Sprite({ texture: Texture.EMPTY }),
    ringBackMask: new Graphics(),
    ringBackBandMask: new Graphics(),
    avatarNonSplitContainer: new Container(),
    avatarNonSplit: new Sprite({ texture: Texture.EMPTY }),
    avatarNonSplitMask: new Graphics(),
    avatarAllowedContainer: new Container(),
    avatarAllowed: new Sprite({ texture: Texture.EMPTY }),
    avatarAllowedMask: new Graphics(),
    avatarRestrictedOuter: new Container(),
    avatarRestrictedInner: new Container(),
    avatarRestricted: new Sprite({ texture: Texture.EMPTY }),
    avatarRestrictedCircleMask: new Graphics(),
    avatarRestrictedHalfMask: new Graphics(),
    ringFrontContainer: new Container(),
    ringFrontBandContainer: new Container(),
    ringFront: new Graphics(),
    ringFrontSprite: new Sprite({ texture: Texture.EMPTY }),
    ringFrontMask: new Graphics(),
    ringFrontBandMask: new Graphics(),
    guide: new Graphics(),
  }

  scene.ringBackBandContainer.addChild(scene.ringBack, scene.ringBackSprite)
  scene.ringBackContainer.addChild(scene.ringBackBandContainer, scene.ringBackBandMask)
  scene.avatarNonSplitContainer.addChild(scene.avatarNonSplit)
  scene.avatarAllowedContainer.addChild(scene.avatarAllowed)
  scene.avatarRestrictedInner.addChild(scene.avatarRestricted)
  scene.avatarRestrictedOuter.addChild(scene.avatarRestrictedInner, scene.avatarRestrictedHalfMask)
  scene.ringFrontBandContainer.addChild(scene.ringFront, scene.ringFrontSprite)
  scene.ringFrontContainer.addChild(scene.ringFrontBandContainer, scene.ringFrontBandMask)
  scene.root.addChild(
    scene.background,
    scene.ringBackContainer,
    scene.avatarNonSplitContainer,
    scene.avatarAllowedContainer,
    scene.avatarRestrictedOuter,
    scene.ringFrontContainer,
    scene.guide,
    scene.ringBackMask,
    scene.avatarNonSplitMask,
    scene.avatarAllowedMask,
    scene.avatarRestrictedCircleMask,
    scene.ringFrontMask,
  )

  scene.ringBackContainer.mask = scene.ringBackMask
  scene.avatarNonSplitContainer.mask = scene.avatarNonSplitMask
  scene.avatarAllowedContainer.mask = scene.avatarAllowedMask
  scene.avatarRestrictedOuter.mask = scene.avatarRestrictedCircleMask
  scene.avatarRestrictedInner.mask = scene.avatarRestrictedHalfMask
  scene.ringFrontContainer.mask = scene.ringFrontMask

  return scene
}

export class PixiTokenRenderer {
  private readonly preference: PreviewRendererPreference
  private app: Application | null = null
  private mountPromise: Promise<void> | null = null
  private destroyRequested = false
  private sceneDestroyed = false
  private canvas: HTMLCanvasElement | null = null
  private image: PreviewImageSource | null = null
  private texture: Texture | null = null
  private ringTexture: Texture | null = null
  private ringImage: PreviewImageSource | null = null
  private ringImageKind: 'builtin' | 'custom' | null = null
  private params: TokenParams | null = null
  private worldSize = PREVIEW_MIN_WORLD_SIZE
  private viewport = { width: PREVIEW_MIN_WORLD_SIZE, height: PREVIEW_MIN_WORLD_SIZE }
  private camera = { scale: 1, x: 0, y: 0 }
  private resizeObserver: ResizeObserver | null = null
  private activePointerId: number | null = null
  private dragStartClient = { x: 0, y: 0 }
  private dragCameraScale = 1
  private dragStartParams: TokenParams | null = null
  private dragMoved = false

  private readonly scene = createPreviewScene()
  private readonly background = this.scene.background
  private readonly ringBackContainer = this.scene.ringBackContainer
  private readonly ringBack = this.scene.ringBack
  private readonly ringBackMask = this.scene.ringBackMask
  private readonly avatarNonSplitContainer = this.scene.avatarNonSplitContainer
  private readonly avatarNonSplit = this.scene.avatarNonSplit
  private readonly avatarNonSplitMask = this.scene.avatarNonSplitMask
  private readonly avatarAllowedContainer = this.scene.avatarAllowedContainer
  private readonly avatarAllowed = this.scene.avatarAllowed
  private readonly avatarAllowedMask = this.scene.avatarAllowedMask
  private readonly avatarRestrictedOuter = this.scene.avatarRestrictedOuter
  private readonly avatarRestricted = this.scene.avatarRestricted
  private readonly avatarRestrictedCircleMask = this.scene.avatarRestrictedCircleMask
  private readonly avatarRestrictedHalfMask = this.scene.avatarRestrictedHalfMask
  private readonly ringFrontContainer = this.scene.ringFrontContainer
  private readonly ringFront = this.scene.ringFront
  private readonly ringFrontMask = this.scene.ringFrontMask
  private readonly guide = this.scene.guide

  private readonly handlers: PreviewInteractionHandlers

  constructor(
    handlers: PreviewInteractionHandlers,
    preference: PreviewRendererPreference = 'webgl',
  ) {
    this.handlers = handlers
    this.preference = preference
  }

  async mount(host: HTMLElement): Promise<void> {
    if (this.destroyRequested) {
      throw new Error('PixiTokenRenderer 已销毁，不能重新挂载')
    }
    if (this.app) return
    if (this.mountPromise) return this.mountPromise

    this.mountPromise = this.mountApplication(host)
    try {
      await this.mountPromise
    } finally {
      this.mountPromise = null
    }
  }

  private async mountApplication(host: HTMLElement): Promise<void> {
    const initialViewport = this.readHostViewport(host)
    this.viewport = initialViewport
    const app = new Application()
    try {
      await app.init(
        createPixiApplicationOptions(
          initialViewport.width,
          initialViewport.height,
          globalThis.devicePixelRatio ?? 1,
          this.preference,
        ),
      )
    } catch (error) {
      this.destroyPartiallyInitializedApplication(app)
      throw error
    }

    if (this.destroyRequested) {
      this.destroyPartiallyInitializedApplication(app)
      return
    }

    this.app = app
    this.canvas = app.canvas as HTMLCanvasElement
    this.canvas.style.cursor = 'grab'
    this.canvas.style.touchAction = 'none'
    this.canvas.style.userSelect = 'none'
    host.replaceChildren(this.canvas)

    app.stage.addChild(this.scene.root)
    app.stage.eventMode = 'static'
    app.renderer.events.features.globalMove = true
    app.stage.on('pointerdown', this.onPointerDown)
    app.stage.on('globalpointermove', this.onPointerMove)
    app.stage.on('pointerup', this.onPointerUp)
    app.stage.on('pointerupoutside', this.onPointerUp)
    app.stage.on('pointercancel', this.onPointerCancel)
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false })

    host.style.width = '100%'
    host.style.height = '100%'
    this.updateViewport(initialViewport.width, initialViewport.height)
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0]
        if (entry) this.updateViewport(entry.contentRect.width, entry.contentRect.height)
      })
      this.resizeObserver.observe(host)
    }
    this.renderScene()
  }

  setImage(image: PreviewImageSource | null): void {
    this.releaseTexture()
    this.image = image

    if (image) {
      this.texture = Texture.from(image.source)
      this.avatarNonSplit.texture = this.texture
      this.avatarAllowed.texture = this.texture
      this.avatarRestricted.texture = this.texture
    }

    this.renderScene()
  }

  setBuiltinRingImage(image: PreviewImageSource | null): void {
    this.setRingImage(image, image ? 'builtin' : null)
  }

  setCustomRingImage(image: PreviewImageSource | null): void {
    this.setRingImage(image, image ? 'custom' : null)
  }

  clearRingImage(): void {
    this.setRingImage(null, null)
  }

  private setRingImage(image: PreviewImageSource | null, kind: 'builtin' | 'custom' | null): void {
    this.scene.ringBackSprite.texture = Texture.EMPTY
    this.scene.ringFrontSprite.texture = Texture.EMPTY
    this.ringTexture?.destroy(true)
    this.ringImage = image
    this.ringImageKind = kind
    this.ringTexture = image ? Texture.from(image.source) : null
    if (this.ringTexture) {
      this.scene.ringBackSprite.texture = this.ringTexture
      this.scene.ringFrontSprite.texture = this.ringTexture
    }
    this.renderScene()
  }

  update(params: TokenParams): void {
    this.params = { ...params }
    this.renderScene()
  }

  snapshot(type = 'image/webp', quality = 0.85): string | undefined {
    this.app?.render()
    return this.canvas?.toDataURL(type, quality)
  }

  destroy(): void {
    this.destroyRequested = true
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    const app = this.app
    if (!app) {
      this.releaseTexture()
      this.clearRingImage()
      this.destroyScene()
      this.image = null
      this.params = null
      return
    }

    app.stage.off('pointerdown', this.onPointerDown)
    app.stage.off('globalpointermove', this.onPointerMove)
    app.stage.off('pointerup', this.onPointerUp)
    app.stage.off('pointerupoutside', this.onPointerUp)
    app.stage.off('pointercancel', this.onPointerCancel)
    this.canvas?.removeEventListener('wheel', this.onWheel)
    this.releaseTexture()
    this.clearRingImage()
    app.destroy({ removeView: true }, { children: true })
    this.sceneDestroyed = true

    this.activePointerId = null
    this.dragStartParams = null
    this.dragMoved = false
    this.image = null
    this.params = null
    this.canvas = null
    this.app = null
  }

  private readonly onPointerDown = (event: FederatedPointerEvent): void => {
    if (!this.image || !this.params || !this.canvas || this.activePointerId !== null) return
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return

    this.activePointerId = event.pointerId
    this.dragStartClient = { x: event.clientX, y: event.clientY }
    this.dragCameraScale = this.camera.scale
    this.dragStartParams = { ...this.params }
    this.dragMoved = false
    this.canvas.style.cursor = 'grabbing'
  }

  private readonly onPointerMove = (event: FederatedPointerEvent): void => {
    if (event.pointerId !== this.activePointerId || !this.dragStartParams || !this.params) {
      return
    }

    const offsets = offsetFromDragDelta(
      this.dragStartParams,
      (event.clientX - this.dragStartClient.x) / this.dragCameraScale,
      (event.clientY - this.dragStartClient.y) / this.dragCameraScale,
      PREVIEW_DISPLAY_TOKEN_SIZE,
    )
    this.dragMoved =
      offsets.offsetX !== this.dragStartParams.offsetX ||
      offsets.offsetY !== this.dragStartParams.offsetY
    this.params = { ...this.params, ...offsets }
    this.handlers.onOffsetChange(offsets.offsetX, offsets.offsetY)
    this.renderScene()
  }

  private readonly onPointerUp = (event: FederatedPointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return
    const shouldCommit = this.dragMoved
    this.activePointerId = null
    this.dragStartParams = null
    this.dragMoved = false
    if (this.canvas) this.canvas.style.cursor = 'grab'
    if (shouldCommit) this.handlers.onOffsetCommit()
    this.renderScene()
  }

  private readonly onPointerCancel = (event: FederatedPointerEvent): void => {
    if (event.pointerId !== this.activePointerId || !this.dragStartParams) return
    const { offsetX, offsetY } = this.dragStartParams
    this.params = { ...this.dragStartParams }
    this.activePointerId = null
    this.dragStartParams = null
    this.dragMoved = false
    if (this.canvas) this.canvas.style.cursor = 'grab'
    this.handlers.onOffsetChange(offsetX, offsetY)
    this.renderScene()
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.image || !this.params || this.activePointerId !== null) return
    event.preventDefault()
    const delta = event.deltaY > 0 ? -TOKEN_SCALE_WHEEL_STEP : TOKEN_SCALE_WHEEL_STEP
    const scale = Math.max(TOKEN_SCALE_MIN, Math.min(TOKEN_SCALE_MAX, this.params.scale + delta))
    if (scale === this.params.scale) return
    this.params = { ...this.params, scale }
    this.handlers.onScaleChange(scale)
    this.renderScene()
  }

  private renderScene(): void {
    const app = this.app
    const params = this.params
    if (!app || !params) return

    if (this.activePointerId === null) {
      this.worldSize = calculatePreviewWorldSize(
        params,
        this.image ? { width: this.image.width, height: this.image.height } : null,
      )
    }
    this.applyCamera()

    const center = this.worldSize / 2
    const elementScale = PREVIEW_DISPLAY_TOKEN_SIZE / Math.max(params.size, 1)
    const innerRadius = Math.max(params.ringInnerRadius * elementScale, 0)
    const outerRadius = Math.max(params.ringOuterRadius * elementScale, 0)
    const hasRing = outerRadius > 0 && innerRadius < outerRadius
    const backgroundColor = parseRgbaHex(params.background)
    const ringColor = parseRgbaHex(params.ringColor)

    this.background.clear()
    if (innerRadius > 0) {
      this.background.circle(center, center, innerRadius).fill(backgroundColor)
    }

    const hasRingTexture = this.ringTexture !== null
    const isCustomRing = hasRingTexture && this.ringImageKind === 'custom'
    this.drawRing(this.ringBack, center, innerRadius, outerRadius, ringColor, false)
    this.drawRing(this.ringFront, center, innerRadius, outerRadius, ringColor, false)
    for (const sprite of [this.scene.ringBackSprite, this.scene.ringFrontSprite]) {
      sprite.visible = hasRingTexture
      sprite.anchor.set(0.5)
      sprite.tint = isCustomRing ? 0xffffff : ringColor.color
      sprite.alpha = ringColor.alpha
      if (isCustomRing && this.ringImage) {
        const layout = calculateCustomRingLayout(
          params,
          this.ringImage,
          center,
          PREVIEW_DISPLAY_TOKEN_SIZE,
        )
        sprite.width = layout.width
        sprite.height = layout.height
        sprite.position.set(layout.x, layout.y)
      } else {
        sprite.width = PREVIEW_DISPLAY_TOKEN_SIZE * params.ringStretchX
        sprite.height = PREVIEW_DISPLAY_TOKEN_SIZE * params.ringStretchY
        sprite.position.set(center, center)
      }
    }

    for (const [container, mask] of [
      [this.scene.ringBackBandContainer, this.scene.ringBackBandMask],
      [this.scene.ringFrontBandContainer, this.scene.ringFrontBandMask],
    ] as const) {
      mask.clear()
      if (isCustomRing) {
        mask
          .circle(center, center, outerRadius)
          .fill(0xffffff)
          .circle(center, center, innerRadius)
          .cut()
        container.mask = mask
      } else {
        container.mask = null
      }
    }

    const allowedPolygon = calculateHalfPlanePolygon(
      params.splitAngle,
      params.splitHeight,
      this.worldSize,
      PREVIEW_DISPLAY_TOKEN_SIZE,
      false,
    )
    const restrictedPolygon = calculateHalfPlanePolygon(
      params.splitAngle,
      params.splitHeight,
      this.worldSize,
      PREVIEW_DISPLAY_TOKEN_SIZE,
      true,
    )
    drawMaskPolygon(this.ringBackMask, allowedPolygon)
    drawMaskPolygon(this.avatarAllowedMask, allowedPolygon)
    drawMaskPolygon(this.avatarRestrictedHalfMask, restrictedPolygon)
    if (params.splitRing) {
      drawMaskPolygon(this.ringFrontMask, restrictedPolygon)
    } else {
      drawFullMask(this.ringFrontMask, this.worldSize)
    }
    drawCircleMask(this.avatarNonSplitMask, center, innerRadius)
    drawCircleMask(this.avatarRestrictedCircleMask, center, innerRadius)

    const hasImage = this.image !== null
    this.avatarNonSplitContainer.visible = hasImage && !params.splitRing
    this.avatarAllowedContainer.visible = hasImage && params.splitRing
    this.avatarRestrictedOuter.visible = hasImage && params.splitRing
    this.ringBackContainer.visible = hasRing && params.splitRing
    this.ringFrontContainer.visible = hasRing

    if (this.image) {
      const layout = calculateAvatarLayout(
        params,
        { width: this.image.width, height: this.image.height },
        this.worldSize,
        PREVIEW_DISPLAY_TOKEN_SIZE,
      )
      for (const sprite of [this.avatarNonSplit, this.avatarAllowed, this.avatarRestricted]) {
        sprite.position.set(layout.x, layout.y)
        sprite.width = layout.width
        sprite.height = layout.height
      }
    }

    this.guide.visible = params.splitRing
    if (params.splitRing) {
      const guide = calculateGuideSegment(
        params.splitAngle,
        params.splitHeight,
        this.worldSize,
        PREVIEW_DISPLAY_TOKEN_SIZE,
      )
      drawDashedGuide(this.guide, guide.start, guide.end)
    } else {
      this.guide.clear()
    }

    app.render()
  }

  private readHostViewport(host: HTMLElement): { width: number; height: number } {
    const rect = host.getBoundingClientRect?.()
    return {
      width: Math.max(1, Math.round(rect?.width || PREVIEW_MIN_WORLD_SIZE)),
      height: Math.max(1, Math.round(rect?.height || PREVIEW_MIN_WORLD_SIZE)),
    }
  }

  private updateViewport(width: number, height: number): void {
    const app = this.app
    if (!app) return

    const nextWidth = Math.max(1, Math.round(width))
    const nextHeight = Math.max(1, Math.round(height))
    const changed = nextWidth !== this.viewport.width || nextHeight !== this.viewport.height
    this.viewport = { width: nextWidth, height: nextHeight }
    if (changed) app.renderer.resize(nextWidth, nextHeight)
    app.stage.hitArea = new Rectangle(0, 0, nextWidth, nextHeight)
    this.applyCamera()
    if (this.params) this.renderScene()
  }

  private applyCamera(): void {
    const camera = calculatePreviewCameraTransform(
      this.viewport.width,
      this.viewport.height,
      this.worldSize,
    )
    this.camera = camera
    this.scene.root.scale.set(camera.scale)
    this.scene.root.position.set(camera.x, camera.y)
  }

  private drawRing(
    graphics: Graphics,
    center: number,
    innerRadius: number,
    outerRadius: number,
    color: { color: number; alpha: number },
    visible: boolean,
  ): void {
    graphics.clear()
    if (!visible) return
    graphics
      .circle(center, center, (innerRadius + outerRadius) / 2)
      .stroke({ width: outerRadius - innerRadius, ...color })
  }

  private releaseTexture(): void {
    this.avatarNonSplit.texture = Texture.EMPTY
    this.avatarAllowed.texture = Texture.EMPTY
    this.avatarRestricted.texture = Texture.EMPTY
    this.texture?.destroy(true)
    this.texture = null
  }

  private destroyScene(): void {
    if (this.sceneDestroyed) return
    this.scene.root.destroy({ children: true })
    this.sceneDestroyed = true
  }

  private destroyPartiallyInitializedApplication(app: Application): void {
    try {
      app.destroy({ removeView: true }, { children: true })
    } catch {
      // Pixi can reject during renderer initialization before a full destroy is possible.
    }
  }
}
