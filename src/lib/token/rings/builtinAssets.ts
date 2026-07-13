import bevel from '../../../../src-tauri/src/token/rings/bevel.svg?raw'
import dashed from '../../../../src-tauri/src/token/rings/dashed.svg?raw'
import dots from '../../../../src-tauri/src/token/rings/dots.svg?raw'
import double from '../../../../src-tauri/src/token/rings/double.svg?raw'
import gradientInner from '../../../../src-tauri/src/token/rings/gradient_inner.svg?raw'
import solid from '../../../../src-tauri/src/token/rings/solid.svg?raw'
import segmented from '../../../../src-tauri/src/token/rings/segmented.svg?raw'
import circuit from '../../../../src-tauri/src/token/rings/circuit.svg?raw'
import arcane from '../../../../src-tauri/src/token/rings/arcane.svg?raw'
import notched from '../../../../src-tauri/src/token/rings/notched.svg?raw'
import braided from '../../../../src-tauri/src/token/rings/braided.svg?raw'

export const BUILTIN_RING_SVGS: Readonly<Record<string, string>> = {
  solid,
  double,
  dashed,
  dots,
  gradient_inner: gradientInner,
  bevel,
  segmented,
  circuit,
  arcane,
  notched,
  braided,
}
