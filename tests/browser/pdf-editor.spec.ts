import { test, expect, type Page } from '@playwright/test'
import { PDFDocument, PDFName, PDFNumber, degrees } from 'pdf-lib'
import { readFile } from 'node:fs/promises'

async function fixture() {
  const pdf = await PDFDocument.create()
  for (const rotation of [0, 90, 180, 270]) {
    const page = pdf.addPage([600, 800])
    page.setCropBox(25, 40, 550, 720)
    page.setRotation(degrees(rotation))
    page.node.set(PDFName.of('UserUnit'), PDFNumber.of(2))
    page.drawText('Original PDF content', { x: 70, y: 600 })
  }
  return Buffer.from(await pdf.save())
}

async function addText(page: Page, text: string, spanish = false) {
  const tool = page.getByRole('button', { name: spanish ? 'Agregar texto' : 'Add text', exact: true })
  await expect(tool).toBeEnabled({ timeout: 15_000 })
  await tool.click()
  const paper = page.locator('.pdf-editor-paper')
  await paper.click({ position: { x: 70, y: 140 } })
  const input = page.getByRole('textbox', { name: spanish ? 'Texto para agregar' : 'Text to add' })
  await input.fill(text)
  await input.press('Control+Enter')
  await expect(input).toHaveCount(0)
}

test('editor: images, paste, movement, resizing, history, page persistence and valid download', async ({ page }, testInfo) => {
  await page.goto('/edit-pdf/')
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: await fixture() })
  await addText(page, 'Firma de prueba ñ ✓')
  const overlay = page.locator('.pdf-editor-overlay')
  await expect(overlay).toHaveCount(1)
  await expect(page.locator('.pdf-editor input[type="number"]')).toHaveCount(0)
  await overlay.scrollIntoViewIfNeeded()
  const original = (await overlay.boundingBox())!
  await page.getByRole('button', { name: /bottom right$/ }).scrollIntoViewIfNeeded()
  const corner = (await page.getByRole('button', { name: /bottom right$/ }).boundingBox())!
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2)
  await page.mouse.down()
  await page.mouse.move(corner.x + corner.width / 2 + 70, corner.y + corner.height / 2 + 35, { steps: 8 })
  await page.keyboard.press('Control+z')
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled()
  await page.mouse.up()
  const enlarged = (await overlay.boundingBox())!
  expect(enlarged.width).toBeGreaterThan(original.width)
  expect(enlarged.height).toBeGreaterThan(original.height)
  expect(enlarged.width / enlarged.height).toBeCloseTo(original.width / original.height, 1)
  await page.getByRole('button', { name: /bottom right$/ }).scrollIntoViewIfNeeded()
  const newCorner = (await page.getByRole('button', { name: /bottom right$/ }).boundingBox())!
  await page.mouse.move(newCorner.x + newCorner.width / 2, newCorner.y + newCorner.height / 2)
  await page.mouse.down()
  await page.mouse.move(newCorner.x + newCorner.width / 2 - 35, newCorner.y + newCorner.height / 2 - 18, { steps: 8 })
  await page.mouse.up()
  expect((await overlay.boundingBox())!.width).toBeLessThan(enlarged.width)
  await overlay.focus()
  await page.keyboard.press('ArrowDown')
  const before = await overlay.getAttribute('style')
  await page.getByRole('button', { name: /bottom right$/ }).focus()
  await page.keyboard.press('Enter')
  expect(await overlay.getAttribute('style')).not.toBe(before)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await overlay.getAttribute('style')).toBe(before)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.getByLabel('Page', { exact: true }).selectOption('2')
  await expect(overlay).toHaveCount(0)
  await expect(page.locator('.pdf-editor-page-loading')).toHaveCount(0)
  expect(await page.evaluate(() => document.activeElement?.classList.contains('pdf-editor'))).toBe(true)
  await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 120; canvas.height = 40
    const context = canvas.getContext('2d')!; context.fillStyle = '#006600'; context.fillRect(0, 0, 120, 40)
    const data = new DataTransfer()
    const binary = atob(canvas.toDataURL().split(',')[1])
    data.items.add(new File([Uint8Array.from(binary, (char) => char.charCodeAt(0))], 'signature.png', { type: 'image/png' }))
    const target = document.activeElement ?? document.querySelector('.pdf-editor')!
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
    canvas.width = canvas.height = 0
  })
  await expect(overlay).toHaveCount(1)
  const box = (await overlay.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2 + 30); await page.mouse.up()
  await overlay.click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete element', exact: true }).click()
  await expect(overlay).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(overlay).toHaveCount(1)
  await page.getByLabel('Page', { exact: true }).selectOption('1')
  await expect(overlay).toHaveCount(1)
  await expect(page.locator('.pdf-editor-page-loading')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('editor-desktop.png'), fullPage: true })
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('synthetic-edited.pdf')
  const result = await PDFDocument.load(await readFile((await download.path())!))
  expect(result.getPageCount()).toBe(4)
  expect(result.getPages().map((entry) => entry.getRotation().angle)).toEqual([0, 90, 180, 270])
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('export places overlays precisely on cropped pages at all four rotations and preserves source text', async ({ page }) => {
  await page.goto('/tests/browser/harness.html')
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
  const bytes = Array.from(await fixture())
  const result = await page.evaluate(async (input) => {
    const editorPath = '/src/features/document/lib/pdfEditor.ts'
    const runtimePath = '/src/lib/fileCompatibility/pdfRuntime.ts'
    const { exportEditedPdf } = await import(editorPath)
    const { createPdfLoadingTask } = await import(runtimePath)
    const original = createPdfLoadingTask(new Uint8Array(input))
    let exported: ReturnType<typeof createPdfLoadingTask> | undefined
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 40
    const context = canvas.getContext('2d')!; context.fillStyle = '#00aa00'; context.fillRect(0, 0, 80, 40)
    try {
      const pdf = await original.promise
      const src = canvas.toDataURL('image/png')
      const items = [1, 2, 3, 4].map((page) => ({ id: String(page), page, src, x: .35, y: .45, width: .2, height: .1 }))
      const output = await exportEditedPdf(new Uint8Array(input), pdf, items)
      exported = createPdfLoadingTask(output.slice())
      const final = await exported.promise
      const results = []
      for (let index = 1; index <= 4; index++) {
        const source = await final.getPage(index)
        const viewport = source.getViewport({ scale: 1 })
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
        await source.render({ canvas, viewport }).promise
        const sample = (x: number, y: number) => Array.from(context.getImageData(Math.floor(x * viewport.width), Math.floor(y * viewport.height), 1, 1).data)
        results.push({ center: sample(.45, .5), outside: sample(.3, .5), text: (await source.getTextContent()).items.some((item: { str?: string }) => item.str?.includes('Original PDF content')) })
      }
      return results
    } finally { canvas.width = canvas.height = 0; await original.destroy(); await exported?.destroy() }
  }, bytes)
  for (const entry of result) {
    expect(entry.center).toEqual([0, 170, 0, 255])
    expect(entry.outside).toEqual([255, 255, 255, 255])
    expect(entry.text).toBe(true)
  }
})

test('Spanish mobile controls fit, bad PDFs recover and replacement protects edits', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => localStorage.setItem('naroz-locale-preference-v2', 'es'))
  await page.goto('/edit-pdf/')
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'bad.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') })
  await expect(page.getByRole('alert')).toContainText('No se pudo abrir')
  await page.evaluate((bytes) => {
    const data = new DataTransfer()
    data.items.add(new File([new Uint8Array(bytes)], 'synthetic.pdf', { type: 'application/pdf' }))
    const dropzone = document.querySelector('.upload-dropzone')!
    dropzone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }))
    dropzone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }))
  }, Array.from(await fixture()))
  await addText(page, 'Texto de prueba', true)
  await page.screenshot({ path: testInfo.outputPath('editor-mobile.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'replacement.pdf', mimeType: 'application/pdf', buffer: await fixture() })
  await expect(page.locator('.pdf-editor-overlay')).toHaveCount(1)
  await expect(page.getByRole('alert')).toHaveCount(0)
})


test('inline text edits, cancellation, context actions, keyboard history and compact mobile tools', async ({ page }) => {
  await page.goto('/edit-pdf/')
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: await fixture() })
  await addText(page, 'Hello')
  const overlay = page.locator('.pdf-editor-overlay')
  await overlay.dblclick()
  const input = page.getByRole('textbox', { name: 'Text to add' })
  await expect(input).toHaveValue('Hello')
  await input.fill('Edited text')
  await page.getByLabel('Text color', { exact: true }).focus()
  await expect(input).toHaveValue('Edited text')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeDisabled()
  await input.press('Control+Enter')
  await overlay.dblclick()
  await expect(input).toHaveValue('Edited text')
  await input.fill('Discard this')
  await input.press('Escape')
  await overlay.dblclick()
  await expect(input).toHaveValue('Edited text')
  await input.press('Control+Enter')
  await overlay.click({ button: 'right' })
  await expect(page.getByRole('menu')).toBeVisible()
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click()
  await expect(overlay).toHaveCount(2)
  await page.keyboard.press('Control+z')
  await expect(overlay).toHaveCount(1)
  await page.keyboard.press('Control+Shift+z')
  await expect(overlay).toHaveCount(2)
  await overlay.last().click({ button: 'right' })
  const before = await overlay.last().getAttribute('style')
  await page.getByRole('menuitem', { name: 'Enlarge', exact: true }).click()
  expect(await overlay.last().getAttribute('style')).not.toBe(before)
  await page.setViewportSize({ width: 390, height: 844 })
  await overlay.last().focus()
  await page.getByRole('button', { name: 'Element options', exact: true }).click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await page.getByRole('button', { name: 'Element options', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Delete element', exact: true }).click()
  await expect(overlay).toHaveCount(1)
  await page.getByRole('button', { name: 'Add text', exact: true }).click()
  await page.locator('.pdf-editor-paper').click({ position: { x: 40, y: 240 } })
  await input.fill('Cancelled')
  await input.press('Escape')
  await expect(overlay).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await expect(page.getByRole('button', { name: 'Full screen', exact: true })).toHaveAttribute('title', 'Full screen')
  await expect(page.getByRole('button', { name: 'Images', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add text', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(input).toBeFocused()
  await input.fill('Keyboard text')
  await input.press('Control+Enter')
  await expect(overlay).toHaveCount(2)
  await page.setViewportSize({ width: 390, height: 260 })
  await overlay.last().click({ button: 'right' })
  const menu = page.getByRole('menu')
  await expect(menu).toBeVisible()
  const bounds = (await menu.boundingBox())!
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(260)
  await page.getByRole('menuitem', { name: 'Delete element', exact: true }).click()
  await expect(overlay).toHaveCount(1)
})

test('text edits no longer consume image resources and keep history', async ({ page }) => {
  await page.goto('/edit-pdf/')
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: await fixture() })
  await addText(page, 'Synthetic text')
  const overlay = page.locator('.pdf-editor-overlay')
  for (let index = 0; index < 35; index++) {
    await overlay.dblclick()
    const input = page.getByRole('textbox', { name: 'Text to add' })
    await input.fill('Edited text ' + index)
    await input.press('Control+Enter')
  }
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await overlay.dblclick()
  await expect(page.getByRole('textbox', { name: 'Text to add' })).toHaveValue('Edited text 33')
  await page.getByRole('textbox', { name: 'Text to add' }).press('Escape')
})

test('font changes keep pending text, preserve history and export the chosen appearance', async ({ page }, testInfo) => {
  await page.goto('/edit-pdf/')
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: await fixture() })
  const tool = page.getByRole('button', { name: 'Add text', exact: true })
  await expect(tool).toBeEnabled({ timeout: 15_000 })
  await tool.click()
  const font = page.getByLabel('Font', { exact: true })
  await font.selectOption('serif')
  await page.locator('.pdf-editor-paper').click({ position: { x: 70, y: 140 } })
  const input = page.getByRole('textbox', { name: 'Text to add' })
  await input.fill('Wide Wi ñ ✓')
  await expect(input).toHaveCSS('font-family', 'serif')
  await font.selectOption('monospace')
  await expect(input).toHaveValue('Wide Wi ñ ✓')
  await expect(input).toHaveCSS('font-family', 'monospace')
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled()
  await input.press('Control+Enter')
  const overlay = page.locator('.pdf-editor-overlay')
  const image = overlay.locator('.pdf-editor-text-preview')
  const monoImage = await image.getAttribute('style')
  await font.selectOption('serif')
  expect(await image.getAttribute('style')).not.toBe(monoImage)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await image.getAttribute('style')).toBe(monoImage)
  await overlay.focus()
  await expect(font).toHaveValue('monospace')
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await overlay.focus()
  await expect(font).toHaveValue('serif')
  await overlay.dblclick()
  await expect(font).toHaveValue('serif')
  await page.getByLabel('Text color', { exact: true }).fill('#a02020')
  await expect(input).toHaveCSS('font-family', 'serif')
  await input.press('Control+Enter')
  await page.setViewportSize({ width: 390, height: 844 })
  await overlay.focus()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('editor-fonts-mobile.png'), fullPage: true })
  const downloading = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
  const result = await PDFDocument.load(await readFile((await (await downloading).path())!))
  expect(result.getPageCount()).toBe(4)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('local font access is explicit, deduplicated, and permission denial remains recoverable', async ({ page }) => {
  await page.addInitScript(() => {
    let calls = 0
    Object.defineProperty(window, 'queryLocalFonts', { value: async () => {
      calls++
      if (calls === 1) throw new DOMException('denied', 'NotAllowedError')
      return [{ family: 'Synthetic Custom Font' }, { family: 'Synthetic Custom Font' }, { family: 'Unsafe\nFont' }]
    } })
    Object.defineProperty(window, 'fontQueryCount', { get: () => calls })
  })
  await page.goto('/edit-pdf/')
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: await fixture() })
  await addText(page, 'Local fonts')
  expect(await page.evaluate(() => Reflect.get(window, 'fontQueryCount'))).toBe(0)
  const load = page.getByRole('button', { name: 'Show all device fonts', exact: true })
  await load.click()
  await expect(page.locator('.pdf-editor-font-notice')).toContainText('Could not access device fonts')
  await expect(load).toBeEnabled()
  await load.click()
  await expect(page.locator('.pdf-editor-font-notice')).toContainText('Device fonts are available')
  await expect(page.getByLabel('Font', { exact: true }).locator('option[value="Synthetic Custom Font"]')).toHaveCount(1)
  await expect(page.getByLabel('Font', { exact: true }).locator('option')).not.toContainText(['Unsafe\nFont'])
})

test('multiline styles, unsaved navigation, browser back and clean download state', async ({ page }) => {
  await page.goto('/')
  await page.locator('a[href="/edit-pdf/"]').click()
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: await fixture() })
  const tool = page.getByRole('button', { name: 'Add text', exact: true })
  await expect(tool).toBeEnabled({ timeout: 15_000 })
  await tool.click()
  await page.locator('.pdf-editor-paper').click({ position: { x: 70, y: 100 } })
  const input = page.getByRole('textbox', { name: 'Text to add' })
  await input.fill('First line')
  await input.press('End'); await input.press('Enter'); await input.press('F'); await input.press('i')
  await expect(input).toHaveValue('First line\nFi')
  await page.getByRole('button', { name: 'Bold', exact: true }).click()
  await page.getByRole('button', { name: 'Italic', exact: true }).click()
  await page.getByRole('button', { name: 'Center text', exact: true }).click()
  await expect(input).toHaveValue('First line\nFi')
  await input.press('Control+Enter')
  const text = page.locator('.pdf-editor-text-preview')
  await expect(text.locator('text')).toHaveCount(2)
  await expect(text).toHaveCSS('font-weight', '700')
  await expect(text).toHaveCSS('font-style', 'italic')
  expect(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented })).toBe(true)
  let prompts = 0
  page.on('dialog', (dialog) => { prompts++; void dialog.dismiss() })
  await page.locator('.topbar-brand-button').click()
  await expect(page).toHaveURL(/edit-pdf/)
  await expect(text.locator('text')).toHaveText(['First line', 'Fi'])
  await expect.poll(() => prompts).toBe(1)
  await page.evaluate(() => history.back())
  await expect.poll(() => prompts).toBe(2)
  await expect(page).toHaveURL(/edit-pdf/)
  await expect(text).toHaveCount(1)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
  await download
  await expect(page.locator('.pdf-editor-heading')).toContainText('PDF downloaded')
  expect(await page.evaluate(() => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented })).toBe(false)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await page.locator('.topbar-brand-button').click()
  await expect(page).toHaveURL(/edit-pdf/)
  await expect.poll(() => prompts).toBe(3)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await page.locator('.topbar-brand-button').click()
  await expect(page).toHaveURL('http://127.0.0.1:5173/')
  expect(prompts).toBe(3)
})

test('image crop, rotation, opacity, guides, four corners, thumbnails and responsive zoom', async ({ page }, testInfo) => {
  await page.goto('/edit-pdf/')
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: await fixture() })
  await expect(page.getByRole('button', { name: 'Images', exact: true })).toBeEnabled({ timeout: 15_000 })
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 100
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 100, 100); ctx.fillStyle = '#0000ff'; ctx.fillRect(100, 0, 100, 100)
    const binary = atob(canvas.toDataURL().split(',')[1]); canvas.width = canvas.height = 0
    return Array.from(binary, (character) => character.charCodeAt(0))
  })
  await page.locator('.pdf-editor input[type=file]').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: Buffer.from(bytes) })
  const overlay = page.locator('.pdf-editor-overlay'), image = overlay.locator('img')
  await expect(overlay).toHaveCount(1)
  await expect(overlay.locator('.pdf-editor-resize')).toHaveCount(4)
  const beforeSrc = await image.getAttribute('src'), beforeStyle = await overlay.getAttribute('style')
  await page.getByRole('button', { name: 'Crop image', exact: true }).click()
  const surface = page.locator('.pdf-editor-crop-surface')
  await surface.focus()
  for (let index = 0; index < 25; index++) await page.keyboard.press('Shift+ArrowLeft')
  for (let index = 0; index < 25; index++) await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: 'Apply crop', exact: true }).click()
  await expect(surface).toHaveCount(0)
  expect(await image.getAttribute('src')).not.toBe(beforeSrc)
  const cropColor = await image.evaluate(async (element) => {
    const bitmap = await createImageBitmap(element as HTMLImageElement)
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!; ctx.drawImage(bitmap, 0, 0)
    const color = Array.from(ctx.getImageData(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1).data)
    bitmap.close(); canvas.width = canvas.height = 0; return color
  })
  expect(cropColor).toEqual([0, 0, 255, 255])
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  expect(await image.getAttribute('src')).toBe(beforeSrc)
  expect(await overlay.getAttribute('style')).toBe(beforeStyle)
  await overlay.focus()
  await page.getByRole('button', { name: 'Rotate 90°', exact: true }).click()
  await expect(overlay).toHaveCSS('transform', 'matrix(0, 1, -1, 0, 0, 0)')
  const opacity = page.getByRole('slider', { name: 'Opacity', exact: true })
  await opacity.fill('0.5'); await opacity.press('Tab')
  await expect(overlay.locator('.pdf-editor-object-content')).toHaveCSS('opacity', '0.5')
  await overlay.focus()
  const corner = page.getByRole('button', { name: /top left$/ })
  await corner.press('Enter')
  await page.getByRole('button', { name: 'Page thumbnails', exact: true }).click()
  const pages = page.getByRole('navigation', { name: 'Page thumbnails', exact: true })
  await expect(pages.locator('canvas').first()).not.toHaveAttribute('width', '0')
  await pages.getByRole('button', { name: 'Page 2', exact: true }).click()
  await expect(overlay).toHaveCount(0)
  await pages.getByRole('button', { name: 'Page 1', exact: true }).click()
  await expect(overlay).toHaveCount(1)
  await page.getByLabel('Zoom', { exact: true }).selectOption('page')
  await expect(page.locator('.pdf-editor-page-loading')).toHaveCount(0)
  const paper = page.locator('.pdf-editor-paper'), scroller = page.locator('.pdf-editor-scroll')
  const paperBounds = (await paper.boundingBox())!, scrollBounds = (await scroller.boundingBox())!
  expect(paperBounds.height).toBeLessThanOrEqual(scrollBounds.height)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByLabel('Zoom', { exact: true }).selectOption('width')
  await page.screenshot({ path: testInfo.outputPath('editor-improved-mobile.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.getByRole('button', { name: 'Page thumbnails', exact: true }).click()
  await expect(pages).toHaveCount(0)
  await page.getByLabel('Zoom', { exact: true }).selectOption('100')
  await overlay.focus()
  const box = (await overlay.boundingBox())!, paperBox = (await paper.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(paperBox.x + paperBox.width / 2, paperBox.y + paperBox.height * .4, { steps: 5 })
  await expect(page.locator('.pdf-editor-guide.is-vertical')).toBeVisible()
  await page.mouse.up()
  await expect(page.locator('.pdf-editor-guide')).toHaveCount(0)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
  await download
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('rotated transparent overlays and vector text export on every page rotation and UserUnit', async ({ page }) => {
  await page.goto('/tests/browser/harness.html')
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
  const result = await page.evaluate(async (input) => {
    const editorPath = '/src/features/document/lib/pdfEditor.ts', runtimePath = '/src/lib/fileCompatibility/pdfRuntime.ts'
    const { exportEditedPdf } = await import(editorPath), { createPdfLoadingTask } = await import(runtimePath)
    const original = createPdfLoadingTask(new Uint8Array(input))
    let exported: ReturnType<typeof createPdfLoadingTask> | undefined
    const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 40
    const context = canvas.getContext('2d')!; context.fillStyle = '#00aa00'; context.fillRect(0, 0, 80, 40)
    try {
      const pdf = await original.promise, src = canvas.toDataURL('image/png')
      const items = [1, 2, 3, 4].flatMap((page) => [
        { id: 'image-' + page, page, src, x: .35, y: .45, width: .2, height: .1, rotation: 90, opacity: .5 },
        { id: 'text-' + page, page, src: '', x: .1, y: .05, width: .3, height: .1, text: 'Hola ñ\nSegunda línea', textFont: 'serif', textBold: true, textItalic: true, textAlign: 'center', rotation: 15 },
        { id: 'unicode-' + page, page, src: '', x: .6, y: .2, width: .3, height: .1, text: 'Firma ✓ 中文', textFont: 'monospace', textColor: '#a02020' },
      ])
      const output = await exportEditedPdf(new Uint8Array(input), pdf, items)
      exported = createPdfLoadingTask(output.slice())
      const final = await exported.promise, results = []
      for (let index = 1; index <= 4; index++) {
        const source = await final.getPage(index), viewport = source.getViewport({ scale: 1 })
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
        await source.render({ canvas, viewport }).promise
        const sample = (x: number, y: number) => Array.from(context.getImageData(Math.floor(x * viewport.width), Math.floor(y * viewport.height), 1, 1).data)
        const text = (await source.getTextContent()).items.map((item: { str?: string }) => item.str ?? '').join(' ')
        const pixels = context.getImageData(Math.floor(viewport.width * .6), Math.floor(viewport.height * .2), Math.floor(viewport.width * .3), Math.floor(viewport.height * .1)).data
        let red = 0
        for (let pixel = 0; pixel < pixels.length; pixel += 4) if (pixels[pixel] > pixels[pixel + 1] + 30 && pixels[pixel] > pixels[pixel + 2] + 30) red++
        results.push({ center: sample(.45, .5), outside: sample(.55, .5), text, red })
      }
      return results
    } finally { canvas.width = canvas.height = 0; await original.destroy(); await exported?.destroy() }
  }, Array.from(await fixture()))
  for (const entry of result) {
    expect(entry.center[0]).toBeGreaterThanOrEqual(126); expect(entry.center[0]).toBeLessThanOrEqual(128)
    expect(entry.center[1]).toBeGreaterThanOrEqual(211); expect(entry.center[1]).toBeLessThanOrEqual(213)
    expect(entry.outside).toEqual([255, 255, 255, 255])
    expect(entry.text).toContain('Hola ñ'); expect(entry.text).toContain('Segunda línea'); expect(entry.text).toContain('Original PDF content')
    expect(entry.red).toBeGreaterThan(20)
  }
})

test('raster fallback and aggregate export memory are bounded and the source remains reusable', async ({ page }) => {
  await page.goto('/tests/browser/harness.html')
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
  const result = await page.evaluate(async (input) => {
    const editorPath = '/src/features/document/lib/pdfEditor.ts', runtimePath = '/src/lib/fileCompatibility/pdfRuntime.ts'
    const { exportEditedPdf, textToPng, PdfExportLimitError } = await import(editorPath)
    const { createPdfLoadingTask } = await import(runtimePath)
    const fallback = textToPng(Array.from({ length: 20 }, () => 'Wide ✓ '.repeat(5)).join('\n'), '#000000', 'serif', {}, { width: 20_000, height: 20_000 })
    const blob = await (await fetch(fallback.src)).blob(), bitmap = await createImageBitmap(blob)
    const dimensions = [bitmap.width, bitmap.height]; bitmap.close()
    const task = createPdfLoadingTask(new Uint8Array(input))
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048
    try {
      const pdf = await task.promise
      const context = canvas.getContext('2d')!
      const items = Array.from({ length: 8 }, (_, index) => {
        context.fillStyle = `rgb(${index * 20}, 80, 120)`; context.fillRect(0, 0, 2048, 2048)
        return { id: String(index), page: 1, src: canvas.toDataURL(), x: .1, y: .1, width: .2, height: .2 }
      })
      let limited = false
      try { await exportEditedPdf(new Uint8Array(input), pdf, items) } catch (error) { limited = error instanceof PdfExportLimitError }
      const source = await pdf.getPage(1)
      const text = (await source.getTextContent()).items.map((item: { str?: string }) => item.str ?? '').join(' ')
      return { dimensions, limited, text }
    } finally { canvas.width = canvas.height = 0; await task.destroy() }
  }, Array.from(await fixture()))
  expect(Math.max(...result.dimensions)).toBeLessThanOrEqual(2048)
  expect(result.dimensions[0] * result.dimensions[1]).toBeLessThanOrEqual(1_002_000)
  expect(result.limited).toBe(true)
  expect(result.text).toContain('Original PDF content')
})

test('closing thumbnails releases canvases and cancelled navigation preserves an inline draft', async ({ page }) => {
  await page.goto('/edit-pdf/')
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'synthetic.pdf', mimeType: 'application/pdf', buffer: await fixture() })
  await expect(page.getByRole('button', { name: 'Images', exact: true })).toBeEnabled({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Page thumbnails', exact: true }).click()
  await expect(page.locator('.pdf-editor-thumbnails canvas').first()).not.toHaveAttribute('width', '0')
  await page.evaluate(() => Reflect.set(window, 'syntheticThumbnailCanvases', Array.from(document.querySelectorAll('.pdf-editor-thumbnails canvas'))))
  await page.getByRole('button', { name: 'Page thumbnails', exact: true }).click()
  expect(await page.evaluate(() => Reflect.get(window, 'syntheticThumbnailCanvases').every((canvas: HTMLCanvasElement) => canvas.width === 0 && canvas.height === 0))).toBe(true)
  await page.getByRole('button', { name: 'Add text', exact: true }).focus()
  await page.keyboard.press('Enter')
  const input = page.getByRole('textbox', { name: 'Text to add' })
  await input.fill('Keep the pending draft')
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('.topbar-brand-button')!.click())
  await expect(page).toHaveURL(/edit-pdf/)
  await expect(input).toHaveValue('Keep the pending draft')
  await input.press('Control+Enter')
  page.once('dialog', (dialog) => dialog.accept())
  await page.locator('.topbar-brand-button').click()
  await expect(page).toHaveURL('http://127.0.0.1:5173/')
})
