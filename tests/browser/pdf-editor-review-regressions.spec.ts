import { test, expect, type Page } from '@playwright/test'
import { PDFDocument, PDFName, PDFRawStream } from 'pdf-lib'
import { deflateSync } from 'node:zlib'

async function inlineFixture(edge: number, count: number, pages = 1, form = false, names = '/W') {
  const pdf = await PDFDocument.create()
  for (let p = 0; p < pages; p++) {
    const sheet = pdf.addPage([600, 800])
    const content: Buffer[] = []
    for (let i = 0; i < count; i++) {
      const pixels = Buffer.alloc(Math.ceil(edge / 8) * edge, i + p)
      content.push(Buffer.from(`q 20 0 0 20 ${i * 22} 0 cm BI ${names} ${edge} /H ${edge} /BPC 1 /CS /G /F /Fl ID\n`), deflateSync(pixels), Buffer.from('\nEI Q\n'))
    }
    const stream = pdf.context.flateStream(Buffer.concat(content), form ? { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 600, 800], Resources: {} } : {})
    const ref = pdf.context.register(stream)
    if (form) {
      sheet.node.set(PDFName.of('Resources'), pdf.context.obj({ XObject: { Form0: ref } }))
      sheet.node.set(PDFName.of('Contents'), pdf.context.register(pdf.context.flateStream('q /Form0 Do Q')))
    } else sheet.node.set(PDFName.of('Contents'), ref)
  }
  return Buffer.from(await pdf.save())
}

async function upload(page: Page, buffer: Buffer) {
  await page.goto('/edit-pdf/')
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'synthetic-regression.pdf', mimeType: 'application/pdf', buffer })
}

async function nestedFixture(type3: boolean) {
  const pdf = await PDFDocument.load(await inlineFixture(4000, type3 ? 1 : 15))
  const sheet = pdf.getPage(0), contents = sheet.node.get(PDFName.of('Contents'))!
  if (type3) {
    const font = pdf.context.register(pdf.context.obj({
      Type: 'Font', Subtype: 'Type3', FontBBox: [0, 0, 1000, 1000], FontMatrix: [.001, 0, 0, .001, 0, 0],
      CharProcs: { A: contents }, Encoding: { Type: 'Encoding', Differences: [65, 'A'] },
      FirstChar: 65, LastChar: 65, Widths: [1000], Resources: {},
    }))
    sheet.node.set(PDFName.of('Resources'), pdf.context.obj({ Font: { F1: font } }))
    sheet.node.set(PDFName.of('Contents'), pdf.context.register(pdf.context.flateStream('BT /F1 20 Tf 1 0 0 1 20 20 Tm (A) Tj ET')))
  } else {
    const mask = pdf.context.register(pdf.context.flateStream(new Uint8Array(2_000_000), { Subtype: 'Image', Width: 4000, Height: 4000, BitsPerComponent: 1, ColorSpace: 'DeviceGray' }))
    const image = pdf.context.register(pdf.context.flateStream(new Uint8Array(1), { Subtype: 'Image', Width: 1, Height: 1, BitsPerComponent: 8, ColorSpace: 'DeviceGray', SMask: mask }))
    sheet.node.set(PDFName.of('Resources'), pdf.context.obj({ XObject: { Base: image } }))
    sheet.node.set(PDFName.of('Contents'), pdf.context.obj([pdf.context.register(pdf.context.flateStream('q /Base Do Q')), contents]))
  }
  return Buffer.from(await pdf.save())
}

test('inline image bombs are rejected before an editor session opens, including forms and multiple pages', async ({ page }) => {
  for (const buffer of [await inlineFixture(4000, 17), await inlineFixture(4000, 9, 2), await inlineFixture(4000, 17, 1, true), await inlineFixture(4000, 17, 1, false, '/#57')]) {
    expect(buffer.length).toBeLessThan(50 * 1024 * 1024)
    await upload(page, buffer)
    await expect(page.getByRole('alert')).toContainText("exceeds the editor's page or image resolution limits", { timeout: 20000 })
    await expect(page.locator('.pdf-editor-controls')).toHaveCount(0)
    await expect(page.locator('.pdf-editor-canvas')).toHaveCount(0)
  }
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'synthetic-valid.pdf', mimeType: 'application/pdf', buffer: await inlineFixture(16, 17) })
  await expect(page.getByRole('button', { name: 'Images', exact: true })).toBeEnabled({ timeout: 20000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('inline images with excessive or invalid dimensions are rejected before opening', async ({ page }) => {
  for (const edge of [4001, 0]) {
    await upload(page, await inlineFixture(edge, 1))
    await expect(page.getByRole('alert')).toContainText("exceeds the editor's page or image resolution limits", { timeout: 20000 })
    await expect(page.locator('.pdf-editor-controls')).toHaveCount(0)
  }
})

test('image masks share the document budget and swallowed Type3 errors still reject preflight', async ({ page }) => {
  await upload(page, await nestedFixture(false))
  await expect(page.getByRole('alert')).toContainText("exceeds the editor's page or image resolution limits", { timeout: 20000 })
  await expect(page.locator('.pdf-editor-controls')).toHaveCount(0)
  await page.goto('/edit-pdf/')
  const rejected = await page.evaluate(async bytes => {
    // @ts-expect-error Vite loads the workspace module in the browser.
    const runtime = await import('/src/lib/fileCompatibility/pdfRuntime.ts')
    const task = runtime.createPdfLoadingTask(new Uint8Array(bytes), { maxImageSize: 16_000_000, canvasMaxAreaInBytes: 64_000_000, imageResourcePreflight: true, maxTotalImagePixels: 1000 })
    try {
      const pdf = await task.promise, sheet = await pdf.getPage(1)
      try { await sheet.getOperatorList(); return false }
      catch (error) { return (error as Error).message.includes('Image resource budget exceeded.') }
      finally { sheet.cleanup() }
    } finally { await task.destroy() }
  }, Array.from(await nestedFixture(true)))
  expect(rejected).toBe(true)
})

test('metadata preflight never emits decoded image operators and counts images across pages', async ({ page }) => {
  await page.goto('/edit-pdf/')
  const result = await page.evaluate(async bytes => {
    // @ts-expect-error Vite loads the workspace module in the browser.
    const runtime = await import('/src/lib/fileCompatibility/pdfRuntime.ts')
    const task = runtime.createPdfLoadingTask(new Uint8Array(bytes), { maxImageSize: 16_000_000, canvasMaxAreaInBytes: 64_000_000, imageResourcePreflight: true, maxTotalImagePixels: 1000 })
    const pdf = await task.promise
    let operations: number[] = [], error = ''
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        const sheet = await pdf.getPage(i)
        try { operations = operations.concat((await sheet.getOperatorList()).fnArray) }
        finally { sheet.cleanup() }
      }
    } catch (failure) { error = (failure as Error).message }
    finally { await task.destroy() }
    return { operations, error }
  }, Array.from(await inlineFixture(16, 3, 2)))
  expect(result.error).toContain('Image resource budget exceeded.')
  expect(result.operations.filter(op => [83, 84, 85, 86, 87, 88, 89, 90].includes(op))).toHaveLength(0)
})

test('hidden print-only annotation images are included in editor preflight', async ({ page }) => {
  const pdf = await PDFDocument.load(await inlineFixture(4001, 1))
  const sheet = pdf.getPage(0), appearance = sheet.node.get(PDFName.of('Contents'))!
  const stream = pdf.context.lookup(appearance, PDFRawStream)
  stream.dict.set(PDFName.of('Subtype'), PDFName.of('Form'))
  stream.dict.set(PDFName.of('BBox'), pdf.context.obj([0, 0, 600, 800]))
  sheet.node.set(PDFName.of('Contents'), pdf.context.register(pdf.context.flateStream('')))
  const annotation = pdf.context.register(pdf.context.obj({ Type: 'Annot', Subtype: 'Stamp', Rect: [0, 0, 100, 100], F: 36, AP: { N: appearance } }))
  sheet.node.set(PDFName.of('Annots'), pdf.context.obj([annotation]))
  await upload(page, Buffer.from(await pdf.save()))
  await expect(page.getByRole('alert')).toContainText("exceeds the editor's page or image resolution limits", { timeout: 20000 })
  await expect(page.locator('.pdf-editor-controls')).toHaveCount(0)
})

test('aborting image preflight destroys its worker and settles without stale state', async ({ page }) => {
  await page.goto('/edit-pdf/')
  const pdf = await PDFDocument.create(); pdf.addPage()
  const result = await page.evaluate(async bytes => {
    // @ts-expect-error Vite loads the workspace module in the browser.
    const { preflightPdfEditorImages } = await import('/src/features/document/lib/pdfImagePreflight.ts')
    const terminate = Worker.prototype.terminate
    let terminations = 0
    Worker.prototype.terminate = function () { terminations++; terminate.call(this) }
    const controller = new AbortController()
    try {
      const checking = preflightPdfEditorImages(new Uint8Array(bytes), controller.signal)
      controller.abort()
      try { await checking; return { aborted: false, terminations } }
      catch (error) { return { aborted: (error as Error).name === 'AbortError', terminations } }
    } finally { Worker.prototype.terminate = terminate }
  }, Array.from(await pdf.save()))
  expect(result.aborted).toBe(true)
  expect(result.terminations).toBe(1)
  await expect(page.locator('.pdf-editor-controls')).toHaveCount(0)
})

test('text retains leading and trailing spaces and blank lines through edit and export', async ({ page }) => {
  const pdf = await PDFDocument.create(); pdf.addPage([600, 800])
  await upload(page, Buffer.from(await pdf.save()))
  await page.getByRole('button', { name: 'Add text', exact: true }).click()
  await page.locator('.pdf-editor-paper').click({ position: { x: 90, y: 120 } })
  const input = page.locator('.pdf-editor-inline-text'), raw = '\n  Account  \n'
  await input.fill(raw); await input.press('Control+Enter')
  await expect(page.locator('.pdf-editor-text-preview text')).toHaveCount(3)
  expect(await page.locator('.pdf-editor-text-preview text').allTextContents()).toEqual(['', '  Account  ', ''])
  await page.locator('.pdf-editor-overlay').dblclick()
  await expect(input).toHaveValue(raw)
  await input.press('Control+Enter')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
  const artifact = await download
  expect(await artifact.failure()).toBeNull()
  await page.locator('.pdf-editor-overlay').dblclick()
  await expect(input).toHaveValue(raw)
})

test('page rendering preserves focus on next, previous and the page selector', async ({ page }) => {
  const pdf = await PDFDocument.create()
  for (let i = 0; i < 3; i++) pdf.addPage([600, 800])
  await upload(page, Buffer.from(await pdf.save()))
  const select = page.getByRole('combobox', { name: 'Page', exact: true })
  await expect(page.getByRole('button', { name: 'Images', exact: true })).toBeEnabled()
  const next = page.getByRole('button', { name: 'Next page', exact: true })
  await next.focus(); await next.press('Enter')
  await expect(select).toHaveValue('2')
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled()
  await expect(next).toBeFocused()
  await select.focus(); await select.selectOption('3')
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled()
  await expect(select).toBeFocused()
  const previous = page.getByRole('button', { name: 'Previous page', exact: true })
  await previous.focus(); await previous.press('Enter')
  await expect(select).toHaveValue('2')
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled()
  await expect(previous).toBeFocused()
})
