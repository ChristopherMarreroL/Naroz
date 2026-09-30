import { test, expect } from 'bun:test'
import { constrainOverlay } from '../src/features/document/lib/pdfEditor'
import { appendHistory, fitOverlay, overlayBounds, resizeOverlay, sameElements, snapOverlay, type ResizeCorner } from '../src/features/document/lib/pdfEditorState'

test('overlay remains inside page when moved beyond any edge', () => {
  const item = { id: '1', page: 1, src: '', x: -2, y: 2, width: .4, height: .2 }
  expect(constrainOverlay(item)).toEqual({ ...item, x: 0, y: .8 })
  expect(constrainOverlay({ ...item, width: 3, height: -1 })).toEqual({ ...item, x: 0, y: .99, width: 1, height: .01 })
})

test('all rotated resize corners preserve aspect, opposite anchor and page bounds', () => {
  const ratio = 550 / 720
  for (const rotation of [0, 45, 90, 180, 270]) for (const corner of ['nw', 'ne', 'sw', 'se'] as ResizeCorner[]) {
    const item = { id: '1', page: 1, src: '', x: .35, y: .35, width: .2, height: .1, rotation }
    const resized = resizeOverlay(item, corner, corner.endsWith('e') ? .04 : -.04, corner.startsWith('s') ? .03 : -.03, ratio)
    expect(resized.width / resized.height).toBeCloseTo(2, 8)
    const anchor = (value: typeof item) => {
      const sx = corner.endsWith('e') ? -1 : 1, sy = corner.startsWith('s') ? -1 : 1
      const angle = rotation * Math.PI / 180
      return [value.x + value.width / 2 + Math.cos(angle) * sx * value.width / 2 - Math.sin(angle) * sy * value.height / ratio / 2, value.y + value.height / 2 + Math.sin(angle) * sx * value.width * ratio / 2 + Math.cos(angle) * sy * value.height / 2]
    }
    const original = anchor(item), next = anchor(resized)
    expect(next[0]).toBeCloseTo(original[0], 8); expect(next[1]).toBeCloseTo(original[1], 8)
    const huge = resizeOverlay(item, corner, corner.endsWith('e') ? 20 : -20, corner.startsWith('s') ? 20 : -20, ratio)
    const bounds = overlayBounds(huge, ratio)
    expect(bounds.left).toBeGreaterThanOrEqual(-1e-7); expect(bounds.top).toBeGreaterThanOrEqual(-1e-7)
    expect(bounds.right).toBeLessThanOrEqual(1 + 1e-7); expect(bounds.bottom).toBeLessThanOrEqual(1 + 1e-7)
  }
})

test('rotation fitting and alignment snapping remain inside cropped page space', () => {
  const item = { id: '1', page: 1, src: '', x: .39, y: .4, width: .2, height: .1, rotation: 0 }
  const snapped = snapOverlay(item, [], .7, .02, .02)
  expect(snapped.item.x).toBeCloseTo(.4); expect(snapped.guides.x).toBe(.5)
  const otherPage = snapOverlay(item, [{ ...item, id: '2', page: 2, x: .385 }], .7, .005, .005)
  expect(otherPage.item.x).toBe(item.x)
  const fitted = fitOverlay({ ...item, x: -.5, y: .9, width: 1, height: 1, rotation: 45 }, .7)
  const bounds = overlayBounds(fitted, .7)
  expect(bounds.left).toBeGreaterThanOrEqual(-1e-8); expect(bounds.bottom).toBeLessThanOrEqual(1 + 1e-8)
})

test('text revisions do not consume image budget; oversized retained history is pruned safely', () => {
  const item = { id: '1', page: 1, src: '', x: .1, y: .1, width: .2, height: .1, text: '0' }
  let state = { entries: [[item]], index: 0 }
  for (let index = 1; index <= 60; index++) state = appendHistory(state, [{ ...item, text: String(index) }]) as typeof state
  expect(state.entries).toHaveLength(51); expect(state.entries[state.index][0].text).toBe('60')
  expect(appendHistory(state, [{ ...item, text: '60' }])).toBe(state)
  let images = { entries: [[]], index: 0 } as Parameters<typeof appendHistory>[0]
  for (let index = 0; index < 40; index++) images = appendHistory(images, [{ ...item, text: undefined, src: 'synthetic-' + index }])
  expect(images.entries).toHaveLength(30); expect(images.index).toBe(29)
  expect(sameElements(images.entries[29], [{ ...images.entries[29][0], opacity: .5 }])).toBe(false)
  expect(() => appendHistory(images, Array.from({ length: 31 }, (_, index) => ({ ...item, text: undefined, id: String(index), src: String(index) })))).toThrow()
})

test('invalid crops fail before decoding or accessing image data', async () => {
  const { cropImage } = await import('../src/features/document/lib/pdfEditor')
  await expect(cropImage('unused', { x: 1, y: 0, width: .02, height: 1 })).rejects.toThrow('crop bounds')
  await expect(cropImage('unused', { x: 0, y: NaN, width: 1, height: 1 })).rejects.toThrow('crop bounds')
})

test('image header budgets reject oversized or disguised images before browser decoding', async () => {
  const { imageToPng } = await import('../src/features/document/lib/pdfEditor')
  const bytes = new Uint8Array(24)
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10], 0)
  bytes.set([73, 72, 68, 82], 12)
  const view = new DataView(bytes.buffer)
  view.setUint32(16, 8000); view.setUint32(20, 8000)
  await expect(imageToPng(new File([bytes], 'synthetic.png', { type: 'image/png' }))).rejects.toThrow()
  await expect(imageToPng(new File(['<svg/>'], 'synthetic.png', { type: 'image/png' }))).rejects.toThrow()
})
