type ResizeBox = { width: number; height: number }

export function createTransformerResizeConfig(selection: { line: boolean; text: boolean; curve: boolean }) {
  return {
    keepRatio: true,
    shiftBehavior: 'none' as const,
    enabledAnchors: selection.curve
      ? []
      : selection.line || selection.text
        ? ['middle-left', 'middle-right']
        : ['top-left', 'top-center', 'top-right', 'middle-right', 'bottom-right', 'bottom-center', 'bottom-left', 'middle-left'],
    boundBoxFunc: (oldBox: ResizeBox, newBox: ResizeBox) => {
      if (selection.line) return Math.abs(newBox.width) < 12 ? oldBox : newBox
      if (selection.text) return Math.abs(newBox.width) < 24 ? oldBox : newBox
      return newBox.width < 12 || newBox.height < 12 ? oldBox : newBox
    },
  }
}
