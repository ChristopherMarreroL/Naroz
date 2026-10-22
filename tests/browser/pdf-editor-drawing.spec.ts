import { test, expect, type Page } from '@playwright/test'
import { PDFDocument, degrees } from 'pdf-lib'
import { readFile } from 'node:fs/promises'

async function openPdf(page: Page, spanish = false) {
  if (spanish) await page.addInitScript(() => localStorage.setItem('naroz-locale-preference-v2', 'es'))
  const pdf = await PDFDocument.create()
  for (const angle of [0, 90, 180, 270]) {
    const sheet = pdf.addPage([600, 800]); sheet.setRotation(degrees(angle))
    sheet.drawText('Synthetic drawing fixture', { x: 40, y: 740 })
  }
  await page.goto('/edit-pdf/')
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'drawing.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) })
  await expect(page.getByRole('button', { name: spanish ? 'Dibujar' : 'Draw', exact: true })).toBeEnabled({ timeout: 20000 })
  await page.getByRole('button', { name: spanish ? 'Dibujar' : 'Draw', exact: true }).click()
}

async function draw(page: Page, x = .2, y = .3) {
  const surface = page.locator('.pdf-editor-drawing-surface')
  await surface.scrollIntoViewIfNeeded()
  const box = (await surface.boundingBox())!
  await page.mouse.move(box.x + box.width * x, box.y + box.height * y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * (x + .25), box.y + box.height * y, { steps: 12 })
  await page.mouse.up()
}

async function screenPixel(page: Page, x: number, y: number) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const png = await page.screenshot({ clip: { x: Math.floor(x), y: Math.floor(y), width: 3, height: 3 } })
  return page.evaluate(async (bytes) => {
    const image = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 3
    try { const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0); return Array.from(context.getImageData(1, 1, 1, 1).data) }
    finally { image.close(); canvas.width = canvas.height = 0 }
  }, Array.from(png))
}

test('eraser button removes visible pixels while held, cancels without changes, and commits once', async ({ page }, info) => {
  await openPdf(page)
  await page.getByLabel('Stroke color', { exact: true }).fill('#e02030')
  await page.getByLabel('Thickness', { exact: true }).fill('24')
  await draw(page)
  const image = page.locator('[data-pdf-drawing-source]')
  const original = await image.getAttribute('href')
  const brush = page.getByLabel('Brush', { exact: true })
  await expect(brush.locator('option[value=eraser]')).toHaveCount(0)
  await expect(brush.locator('option[value=round]')).toContainText('●')
  await expect(brush.locator('option[value=square]')).toContainText('■')
  const eraser = page.getByRole('button', { name: 'Eraser', exact: true })
  await eraser.click()
  await expect(eraser).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Thickness', { exact: true }).fill('40')
  const surface = page.getByRole('group', { name: 'Erase PDF strokes', exact: true })
  await surface.scrollIntoViewIfNeeded()
  const box = (await surface.boundingBox())!
  const x = box.x + box.width * .325, y = box.y + box.height * .3
  expect(await screenPixel(page, x, y)).toEqual([224, 32, 48, 255])
  await page.mouse.move(x, y); await page.mouse.down()
  await expect(surface).toHaveCSS('opacity', '0')
  expect(await screenPixel(page, x, y)).toEqual([255, 255, 255, 255])
  await expect(image).toHaveAttribute('href', original!)
  await surface.press('Escape')
  await page.mouse.up()
  expect(await screenPixel(page, x, y)).toEqual([224, 32, 48, 255])
  await expect(image).toHaveAttribute('href', original!)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * .4, y, { steps: 10 })
  expect(await screenPixel(page, box.x + box.width * .4, y)).toEqual([255, 255, 255, 255])
  await expect(image).toHaveAttribute('href', original!)
  await page.screenshot({ path: info.outputPath('live-eraser.png'), fullPage: true })
  await page.mouse.up()
  await expect(image).not.toHaveAttribute('href', original!)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(image).toHaveAttribute('href', original!)
  await eraser.click()
  await expect(eraser).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByLabel('Stroke color', { exact: true })).toBeEnabled()
})

test('colored brushes persist per page, support history/deletion, and export a valid PDF', async ({ page }, info) => {
  await openPdf(page)
  await page.getByLabel('Stroke color', { exact: true }).fill('#e02030')
  await page.getByLabel('Thickness', { exact: true }).fill('24')
  await draw(page)
  const overlay = page.locator('.pdf-editor-overlay')
  await expect(overlay).toHaveCount(1)
  const firstSrc = await overlay.locator('[data-pdf-drawing-source]').getAttribute('href')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(overlay).toHaveCount(0)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(overlay).toHaveCount(1)
  for (const [target, brush] of [['2', 'square'], ['3', 'marker'], ['4', 'round']]) {
    await page.getByLabel('Page', { exact: true }).selectOption(target)
    await expect(page.locator('.pdf-editor-drawing-surface')).toBeVisible()
    await page.getByLabel('Brush', { exact: true }).selectOption(brush)
    await draw(page)
    await expect(overlay).toHaveCount(1)
  }
  await page.getByLabel('Page', { exact: true }).selectOption('1')
  await expect(overlay.locator('[data-pdf-drawing-source]')).toHaveAttribute('href', firstSrc!)
  await page.getByRole('button', { name: 'Select and move', exact: true }).click()
  await overlay.focus()
  await expect(overlay).toHaveAccessibleName(/Stroke/)
  await overlay.press('Delete')
  await expect(overlay).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
  const download = await event
  const bytes = await readFile((await download.path())!)
  const pdf = await PDFDocument.load(bytes)
  expect(pdf.getPageCount()).toBe(4)
  expect(pdf.getPages().map((sheet) => sheet.getRotation().angle)).toEqual([0, 90, 180, 270])
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('drawing-desktop.png'), fullPage: true })
})

test('cancelled gestures release the canvas and retry; keyboard strokes work without pointer input', async ({ page }) => {
  await openPdf(page)
  const surface = page.locator('.pdf-editor-drawing-surface')
  await surface.scrollIntoViewIfNeeded()
  const box = (await surface.boundingBox())!
  await page.mouse.move(box.x + box.width * .3, box.y + box.height * .3)
  await page.mouse.down()
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeDisabled()
  await surface.dispatchEvent('pointercancel', { pointerId: 1 })
  await page.mouse.up()
  await expect(page.locator('.pdf-editor-overlay')).toHaveCount(0)
  await expect(surface).toHaveAttribute('width', '0')
  await surface.focus()
  await surface.press('Space')
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeDisabled()
  await surface.press('Shift+ArrowRight')
  await surface.press('Escape')
  await expect(page.locator('.pdf-editor-overlay')).toHaveCount(0)
  await surface.press('Space')
  await surface.press('Shift+ArrowRight')
  await surface.press('Space')
  await expect(page.locator('.pdf-editor-overlay')).toHaveCount(1)
  await expect(surface).toHaveAttribute('width', '0')
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled()
  await draw(page, .3, .4)
  await expect(page.locator('.pdf-editor-overlay')).toHaveCount(2)
})

test('Spanish mobile touch strokes and brush controls fit without horizontal overflow', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openPdf(page, true)
  await page.getByLabel('Brocha', { exact: true }).selectOption('marker')
  await page.getByLabel('Color del trazo', { exact: true }).fill('#00aa55')
  const surface = page.locator('.pdf-editor-drawing-surface')
  await surface.scrollIntoViewIfNeeded()
  const box = (await surface.boundingBox())!
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * .2, y: box.y + box.height * .25 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x + box.width * .6, y: box.y + box.height * .25 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
  await expect(page.locator('.pdf-editor-overlay')).toHaveCount(1)
  await expect(page.locator('.pdf-editor-object-content')).toHaveCSS('opacity', '0.3')
  const eraser = page.getByRole('button', { name: 'Goma de borrar', exact: true })
  await eraser.click()
  await expect(eraser).toHaveAttribute('aria-pressed', 'true')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  expect(overflow).toBe(false)
  await page.getByRole('group', { name: 'Opciones de la brocha', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('drawing-mobile-es.png'), fullPage: true })
})

test('drawing pixels retain their color, transparency and crop placement in rotated PDF exports', async ({ page }) => {
  await page.goto('/tests/browser/harness.html')
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
  const result = await page.evaluate(async () => {
    const drawingPath = '/src/features/document/lib/pdfDrawing.ts'
    const editorPath = '/src/features/document/lib/pdfEditor.ts'
    const pdfPath = '/node_modules/.vite/deps/pdf-lib.js'
    const runtimePath = '/src/lib/fileCompatibility/pdfRuntime.ts'
    const { beginPdfStroke } = await import(drawingPath)
    const { exportEditedPdf } = await import(editorPath)
    const { PDFDocument, degrees } = await import(pdfPath)
    const { createPdfLoadingTask } = await import(runtimePath)
    const document = await PDFDocument.create()
    for (const rotation of [0, 90, 180, 270]) { const sheet = document.addPage([600, 800]); sheet.setCropBox(20, 30, 550, 720); sheet.setRotation(degrees(rotation)); sheet.drawText('Keep source text', { x: 40, y: 710 }) }
    const input = await document.save()
    const original = createPdfLoadingTask(input.slice())
    const canvas = window.document.createElement('canvas')
    const context = canvas.getContext('2d')!
    let exported: ReturnType<typeof createPdfLoadingTask> | undefined
    try {
      const pdf = await original.promise, items = []
      let maxPixels = 0
      for (let index = 1; index <= 4; index++) {
        const sheet = await pdf.getPage(index), viewport = sheet.getViewport({ scale: 1 })
        const stroke = beginPdfStroke(canvas, viewport.width / viewport.height, '#e02030', 24, index === 3 ? 'marker' : index === 2 ? 'square' : 'round', { x: .2, y: .3 })
        stroke.move({ x: .6, y: .3 }); maxPixels = Math.max(maxPixels, canvas.width * canvas.height)
        items.push({ ...stroke.finish(), id: String(index), page: index, kind: 'drawing' })
      }
      exported = createPdfLoadingTask((await exportEditedPdf(input, pdf, items)).slice())
      const output = await exported.promise, colors = [], preserved = []
      for (let index = 1; index <= 4; index++) {
        const sheet = await output.getPage(index), viewport = sheet.getViewport({ scale: 1 })
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
        await sheet.render({ canvas, viewport }).promise
        colors.push(Array.from(context.getImageData(Math.floor(viewport.width * .4), Math.floor(viewport.height * .3), 1, 1).data))
        preserved.push((await sheet.getTextContent()).items.some((item: { str?: string }) => item.str?.includes('Keep source text')))
      }
      return { colors, preserved, maxPixels }
    } finally { canvas.width = canvas.height = 0; await original.destroy(); await exported?.destroy() }
  })
  expect(result.maxPixels).toBeLessThanOrEqual(2048 * 2048)
  for (const index of [0, 1, 3]) expect(result.colors[index]).toEqual([224, 32, 48, 255])
  expect(result.colors[2][0]).toBeGreaterThan(240)
  expect(result.colors[2][1]).toBeGreaterThan(180)
  expect(result.colors[2][1]).toBeLessThan(200)
  expect(result.preserved).toEqual([true, true, true, true])
})

test('eraser removes part of a stroke, supports undo/redo and preserves other pages', async ({ page }) => {
  await openPdf(page)
  await page.getByLabel('Stroke color', { exact: true }).fill('#e02030')
  await page.getByLabel('Thickness', { exact: true }).fill('24')
  await draw(page)
  const image = page.locator('.pdf-editor-overlay [data-pdf-drawing-source]')
  const original = await image.getAttribute('href')
  await page.getByRole('button', { name: 'Eraser', exact: true }).click()
  await expect(page.getByLabel('Stroke color', { exact: true })).toBeDisabled()
  await page.getByLabel('Thickness', { exact: true }).fill('40')
  const surface = page.getByRole('group', { name: 'Erase PDF strokes', exact: true })
  const eraseAt = async (x: number, y: number) => {
    await surface.scrollIntoViewIfNeeded()
    const box = (await surface.boundingBox())!
    await page.mouse.click(box.x + box.width * x, box.y + box.height * y)
  }
  await page.evaluate(() => {
    const decode = window.createImageBitmap
    window.createImageBitmap = () => { window.createImageBitmap = decode; return Promise.reject(new Error('synthetic decode failure')) }
  })
  await eraseAt(.325, .3)
  await expect(page.getByRole('alert')).toContainText('could not be erased')
  await expect(image).toHaveAttribute('href', original!)
  await eraseAt(.8, .3)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await eraseAt(.325, .3)
  await expect(image).not.toHaveAttribute('href', original!)
  const erased = await image.getAttribute('href')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(image).toHaveAttribute('href', original!)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(image).toHaveAttribute('href', erased!)
  await page.getByLabel('Page', { exact: true }).selectOption('2')
  await expect(surface).toBeVisible()
  await surface.focus(); await surface.press('Space'); await surface.press('ArrowRight'); await surface.press('Space')
  await expect(page.locator('.pdf-editor-overlay')).toHaveCount(0)
  await page.getByLabel('Page', { exact: true }).selectOption('1')
  await expect(image).toHaveAttribute('href', erased!)
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
  const downloaded = await event
  expect((await PDFDocument.load(await readFile((await downloaded.path())!))).getPageCount()).toBe(4)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('eraser reveals original PDF pixels after transformed strokes and leaves imported content alone', async ({ page }) => {
  await page.goto('/tests/browser/harness.html')
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
  const result = await page.evaluate(async () => {
    const drawingPath = '/src/features/document/lib/pdfDrawing.ts', editorPath = '/src/features/document/lib/pdfEditor.ts'
    const pdfPath = '/node_modules/.vite/deps/pdf-lib.js', runtimePath = '/src/lib/fileCompatibility/pdfRuntime.ts'
    const { beginPdfStroke, erasePdfStrokes } = await import(drawingPath)
    const { exportEditedPdf } = await import(editorPath)
    const { PDFDocument, degrees, rgb } = await import(pdfPath)
    const { createPdfLoadingTask } = await import(runtimePath)
    const pdf = await PDFDocument.create()
    for (const rotation of [0, 90, 180, 270]) {
      const sheet = pdf.addPage([600, 800]); sheet.setCropBox(20, 30, 550, 720); sheet.setRotation(degrees(rotation))
      sheet.drawRectangle({ x: 0, y: 0, width: 600, height: 800, color: rgb(.8, .9, 1) })
      sheet.drawText('Original content stays', { x: 40, y: 710 })
    }
    const input = await pdf.save(), original = createPdfLoadingTask(input.slice())
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d')!
    let exported: ReturnType<typeof createPdfLoadingTask> | undefined
    try {
      const preview = await original.promise, items = [], samples = []
      let preserved = true, removedDot = false, cancelled = false, noOp = false
      for (let index = 1; index <= 4; index++) {
        const sheet = await preview.getPage(index), viewport = sheet.getViewport({ scale: 1 }), ratio = viewport.width / viewport.height
        const stroke = beginPdfStroke(canvas, ratio, '#e02030', 24, 'round', { x: .2, y: .3 }); stroke.move({ x: .7, y: .3 })
        const item = { ...stroke.finish(), id: String(index), page: index, kind: 'drawing', rotation: [0, 35, 90, -40][index - 1] }
        const center = { x: item.x + item.width / 2, y: item.y + item.height / 2 }
        const erase = beginPdfStroke(canvas, ratio, '#000000', 40, 'eraser', center).finish()
        const imported = { ...item, id: 'image', kind: undefined, src: item.src.slice(0, 'data:image/png;base64,'.length + 32) }
        const text = { ...item, id: 'text', kind: undefined, text: 'Keep text', src: '' }
        const stack = [item, imported, text]
        cancelled = (await erasePdfStrokes(stack, index, ratio, erase, () => true)) === stack
        const output = await erasePdfStrokes(stack, index, ratio, erase)
        preserved &&= output[1] === imported && output[2] === text && item.src !== output[0].src
        items.push(output[0])
        const radians = item.rotation * Math.PI / 180
        samples.push({ center, retained: { x: center.x + Math.cos(radians) * item.width * .25, y: center.y + Math.sin(radians) * item.width * .25 * ratio } })
        const tiny = { ...item, ...beginPdfStroke(canvas, ratio, '#000000', 6, 'round', center).finish() }
        removedDot = (await erasePdfStrokes([tiny], index, ratio, erase)).length === 0
        const emptyMask = beginPdfStroke(canvas, ratio, '#000000', 6, 'eraser', { x: .95, y: .95 }).finish()
        noOp = (await erasePdfStrokes(stack, index, ratio, emptyMask)) === stack
      }
      exported = createPdfLoadingTask((await exportEditedPdf(input, preview, items)).slice())
      const output = await exported.promise, pixels = [], textPresent = []
      for (let index = 1; index <= 4; index++) {
        const sheet = await output.getPage(index), viewport = sheet.getViewport({ scale: 1 })
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
        await sheet.render({ canvas, viewport }).promise
        const sample = (point: { x: number; y: number }) => Array.from(context.getImageData(Math.floor(point.x * viewport.width), Math.floor(point.y * viewport.height), 1, 1).data)
        pixels.push({ hole: sample(samples[index - 1].center), retained: sample(samples[index - 1].retained) })
        textPresent.push((await sheet.getTextContent()).items.some((item: { str?: string }) => item.str?.includes('Original content stays')))
      }
      return { pixels, preserved, removedDot, cancelled, noOp, textPresent }
    } finally { canvas.width = canvas.height = 0; await original.destroy(); await exported?.destroy() }
  })
  expect(result.preserved && result.removedDot && result.cancelled && result.noOp).toBe(true)
  for (const sample of result.pixels) {
    expect(sample.hole).toEqual([204, 230, 255, 255])
    expect(sample.retained).toEqual([224, 32, 48, 255])
  }
  expect(result.textPresent).toEqual([true, true, true, true])
})

test('review: admitted large drawings still export after an over-budget gesture is rejected', async ({ page }) => {
  await page.goto('/tests/browser/harness.html')
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
  const result = await page.evaluate(async () => {
    const drawingPath = '/src/features/document/lib/pdfDrawing.ts', statePath = '/src/features/document/lib/pdfEditorState.ts'
    const editorPath = '/src/features/document/lib/pdfEditor.ts', runtimePath = '/src/lib/fileCompatibility/pdfRuntime.ts'
    const pdfPath = '/node_modules/.vite/deps/pdf-lib.js'
    const { beginPdfStroke } = await import(drawingPath)
    const { appendHistory, imageBudget } = await import(statePath)
    const { exportEditedPdf } = await import(editorPath)
    const { createPdfLoadingTask } = await import(runtimePath)
    const { PDFDocument } = await import(pdfPath)
    const document = await PDFDocument.create(); document.addPage([600, 800]).drawText('Synthetic export budget fixture')
    const bytes = await document.save(), task = createPdfLoadingTask(bytes.slice())
    const canvas = window.document.createElement('canvas')
    try {
      let history = { entries: [[]], index: 0 }, rejected = 0
      for (let index = 0; index < 11; index++) {
        const stroke = beginPdfStroke(canvas, .75, `#${(0x100000 + index * 0x100).toString(16)}`, 6, 'round', { x: 0, y: 0 })
        stroke.move({ x: 1, y: 1 })
        const item = { ...stroke.finish(), id: String(index), page: 1, kind: 'drawing' }
        const next = [...history.entries[history.index], item]
        if (imageBudget(next)) history = appendHistory(history, next)
        else rejected++
      }
      const preview = await task.promise
      const output = await exportEditedPdf(bytes, preview, history.entries[history.index])
      const loaded = await PDFDocument.load(output)
      return { accepted: history.entries[history.index].length, rejected, pages: loaded.getPageCount(), bytes: output.length }
    } finally { canvas.width = canvas.height = 0; await task.destroy() }
  })
  expect(result.accepted).toBe(10)
  expect(result.rejected).toBe(1)
  expect(result.pages).toBe(1)
  expect(result.bytes).toBeGreaterThan(1000)
})

test('review: erasing over 30 of 100 real PNG strokes preserves undo and redo', async ({ page }) => {
  await page.goto('/tests/browser/harness.html')
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
  const result = await page.evaluate(async () => {
    const drawingPath = '/src/features/document/lib/pdfDrawing.ts', statePath = '/src/features/document/lib/pdfEditorState.ts'
    const { beginPdfStroke, erasePdfStrokes } = await import(drawingPath)
    const { appendHistory, imageBudget } = await import(statePath)
    const canvas = document.createElement('canvas')
    try {
      const before = Array.from({ length: 100 }, (_, index) => ({
        ...beginPdfStroke(canvas, .75, `#${(0x100000 + index * 0x100).toString(16)}`, 10, 'round', { x: .1 + (index % 10) * .08, y: .1 + Math.floor(index / 10) * .08 }).finish(),
        id: String(index), page: 1, kind: 'drawing',
      }))
      const gesture = beginPdfStroke(canvas, .75, '#000000', 1, 'eraser', { x: .1, y: .1 })
      for (let column = 0; column < 4; column++) {
        const x = .1 + column * .08
        gesture.move({ x, y: column % 2 ? .82 : .1 })
        gesture.move({ x, y: column % 2 ? .1 : .82 })
      }
      const after = await erasePdfStrokes(before, 1, .75, gesture.finish())
      const changed = after.filter((item: { src: string }, index: number) => item.src !== before[index].src).length
      const history = appendHistory({ entries: [[], before.slice(0, 50), before], index: 2 }, after)
      return {
        changed, accepted: imageBudget(before) && imageBudget(after), count: after.length,
        undo: history.entries[history.index - 1] === before,
        redo: history.entries[history.index] === after,
      }
    } finally { canvas.width = canvas.height = 0 }
  })
  expect(result.accepted).toBe(true)
  expect(result.changed).toBeGreaterThanOrEqual(31)
  expect(result.count).toBe(100)
  expect(result.undo && result.redo).toBe(true)
})
