import type { ShapeKind } from './handout'
import type { MessageKey } from '@/i18n/en-US'

export const shapeItems: Array<{ kind: ShapeKind; labelKey: MessageKey; detailKey: MessageKey }> = [
  { kind: 'line', labelKey: 'SHAPE_LINE', detailKey: 'SHAPE_LINE_DETAIL' },
  { kind: 'quadratic-curve', labelKey: 'SHAPE_QUADRATIC_CURVE', detailKey: 'SHAPE_QUADRATIC_CURVE_DETAIL' },
  { kind: 'cubic-bezier', labelKey: 'SHAPE_CUBIC_BEZIER', detailKey: 'SHAPE_CUBIC_BEZIER_DETAIL' },
  { kind: 'rect', labelKey: 'SHAPE_RECTANGLE', detailKey: 'SHAPE_RECTANGLE_DETAIL' },
  { kind: 'round-rect', labelKey: 'SHAPE_ROUND_RECT', detailKey: 'SHAPE_ROUND_RECT_DETAIL' },
  { kind: 'ellipse', labelKey: 'SHAPE_ELLIPSE', detailKey: 'SHAPE_ELLIPSE_DETAIL' },
  { kind: 'polygon', labelKey: 'SHAPE_POLYGON', detailKey: 'SHAPE_POLYGON_DETAIL' },
  { kind: 'diamond', labelKey: 'SHAPE_DIAMOND', detailKey: 'SHAPE_DIAMOND_DETAIL' },
  { kind: 'hexagon-h', labelKey: 'SHAPE_HEXAGON_H', detailKey: 'SHAPE_HEXAGON_H_DETAIL' },
  { kind: 'hexagon-v', labelKey: 'SHAPE_HEXAGON_V', detailKey: 'SHAPE_HEXAGON_V_DETAIL' },
]
