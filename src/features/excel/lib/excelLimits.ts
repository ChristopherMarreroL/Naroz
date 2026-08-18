import type { Range } from 'xlsx'

export function limitExcelRange(sourceRange: Range, maxRows: number, maxColumns: number): Range {
  return {
    s: sourceRange.s,
    e: {
      c: Math.min(sourceRange.e.c, sourceRange.s.c + maxColumns - 1),
      r: Math.min(sourceRange.e.r, sourceRange.s.r + maxRows - 1),
    },
  }
}
