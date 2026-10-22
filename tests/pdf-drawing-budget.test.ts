import { expect, test } from 'bun:test'
import { appendHistory, imageBudget, type EditorHistory } from '../src/features/document/lib/pdfEditorState'

function pngHeader(id: number, width = 32, height = 32) {
  const bytes = new Uint8Array(28)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10])
  bytes.set([73, 72, 68, 82], 12)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width); view.setUint32(20, height); view.setUint32(24, id)
  return `data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`
}

function drawing(id: number, width = 32, height = 32) {
  return { id: String(id), page: 1, kind: 'drawing' as const, src: pngHeader(id, width, height), x: .1, y: .1, width: .5, height: .5 }
}

test('review: reject an eleventh full-page stroke before it makes downloads fail', () => {
  const strokes = Array.from({ length: 11 }, (_, id) => drawing(id, 1536, 2048))
  expect(imageBudget(strokes.slice(0, 10))).toBe(true)
  expect(imageBudget(strokes)).toBe(false)
  const before: EditorHistory = { entries: [strokes.slice(0, 10)], index: 0 }
  expect(() => appendHistory(before, strokes)).toThrow()
  expect(before.entries[before.index]).toHaveLength(10)
})

test('review: an eraser changing 31 of 100 strokes retains the immediate undo snapshot', () => {
  const before = Array.from({ length: 100 }, (_, id) => drawing(id))
  const after = before.map((item, index) => index < 31 ? { ...item, src: pngHeader(index + 100) } : item)
  const history = appendHistory({ entries: [before], index: 0 }, after)
  expect(history.index).toBeGreaterThan(0)
  expect(history.entries[history.index - 1]).toEqual(before)
  expect(history.entries[history.index]).toEqual(after)
})

test('review: history pruning preserves both sides even when every stroke is replaced', () => {
  const before = Array.from({ length: 100 }, (_, id) => drawing(id))
  const after = before.map((item, index) => ({ ...item, src: pngHeader(index + 100) }))
  const again = before.map((item, index) => ({ ...item, src: pngHeader(index + 200) }))
  const history = appendHistory(appendHistory({ entries: [before], index: 0 }, after), again)
  expect(history.entries).toHaveLength(2)
  expect(history.entries[0]).toEqual(after)
  expect(history.entries[1]).toEqual(again)
})

test('decoded pixels are deduplicated by source and shared by imported images and strokes', () => {
  const strokes = Array.from({ length: 32 }, (_, id) => drawing(id, 1000, 1000))
  expect(imageBudget(strokes)).toBe(true)
  expect(imageBudget([...strokes, drawing(32, 1, 1)])).toBe(false)
  expect(imageBudget(Array.from({ length: 100 }, (_, id) => ({ ...drawing(id), src: strokes[0].src })))).toBe(true)
  const imported = { ...drawing(100, 1000, 1000), kind: undefined }
  expect(imageBudget([...strokes, imported])).toBe(false)
})

test('invalid or unsafe PNG dimensions are rejected without decoding the image', () => {
  expect(imageBudget([{ ...drawing(0), src: 'not a PNG' }])).toBe(false)
  expect(imageBudget([drawing(0, 0, 32)])).toBe(false)
  expect(imageBudget([drawing(0, 32, 0)])).toBe(false)
  expect(imageBudget([drawing(0, 0xffffffff, 0xffffffff)])).toBe(false)
  expect(imageBudget([{ ...drawing(0), src: 'data:image/png;base64,!!!!!!!!!!!!!!!' }])).toBe(false)
})

test('two large but individually bounded snapshots remain undoable within the reserved budget', () => {
  const before = [{ ...drawing(0), src: pngHeader(0) + 'A'.repeat(20_000_000) }]
  const after = [{ ...drawing(0), src: pngHeader(1) + 'B'.repeat(20_000_000) }]
  const history = appendHistory({ entries: [before], index: 0 }, after)
  expect(history.index).toBe(1)
  expect(history.entries[0]).toEqual(before)
  expect(history.entries[1]).toEqual(after)
})
