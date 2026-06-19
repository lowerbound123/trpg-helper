export type RectBounds = {
  x: number
  y: number
  width: number
  height: number
}

export function containsRect(container: RectBounds, item: RectBounds) {
  return item.x >= container.x
    && item.y >= container.y
    && item.x + item.width <= container.x + container.width
    && item.y + item.height <= container.y + container.height
}
