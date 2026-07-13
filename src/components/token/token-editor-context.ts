import type { InjectionKey } from 'vue'
import type { Driver, Item } from 'vuefinder'

export interface TokenEditorContext {
  finderRevision: { asset: number }
  uploadConfig: Record<string, unknown>
  assetDriver: Driver
  assetFeatures: Record<string, boolean>
  assetContextMenuItems: Item[]
  onPathChange(path: string): void
  onDragover(event: DragEvent): void
  onDrop(event: DragEvent): void
}

export const tokenEditorContextKey: InjectionKey<TokenEditorContext> = Symbol('token-editor-context')
