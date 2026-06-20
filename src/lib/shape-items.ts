import type { ShapeKind } from './handout'

export const shapeItems: Array<{ kind: ShapeKind; label: string; detail: string }> = [
  { kind: 'line', label: 'Line', detail: 'Stroke-only horizontal line' },
  { kind: 'quadratic-curve', label: 'Quadratic curve', detail: 'One-control Bezier curve' },
  { kind: 'cubic-bezier', label: 'Cubic Bezier', detail: 'Two-control Bezier curve' },
  { kind: 'rect', label: 'Rectangle', detail: 'Filled rectangle with stroke' },
  { kind: 'round-rect', label: 'Round rect', detail: 'Rectangle with configurable corners' },
  { kind: 'ellipse', label: 'Ellipse', detail: 'Circle or oval shape' },
  { kind: 'diamond', label: 'Diamond', detail: 'Centered rhombus shape' },
  { kind: 'hexagon-h', label: 'Hexagon H', detail: 'Horizontal hexagon' },
  { kind: 'hexagon-v', label: 'Hexagon V', detail: 'Vertical hexagon' },
]
