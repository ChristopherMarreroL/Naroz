import { test, expect, type Page, type Locator } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

async function openEditor(page: Page, spanish = false) {
  const pdf = await PDFDocument.create()
  pdf.addPage([600, 800]).drawText('Synthetic document for editor controls', { x: 40, y: 30, size: 12 })
  await page.goto('/edit-pdf/')
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'synthetic-controls.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) })
  await expect(page.getByRole('button', { name: spanish ? 'Imágenes' : 'Images', exact: true })).toBeEnabled()
}

async function addText(page: Page, spanish = false) {
  await page.getByRole('button', { name: spanish ? 'Agregar texto' : 'Add text', exact: true }).click()
  await page.locator('.pdf-editor-paper').click({ position: { x: 90, y: 120 } })
  const input = page.getByRole('textbox', { name: spanish ? 'Texto para agregar' : 'Text to add', exact: true })
  await input.fill('hola'); await input.press('Control+Enter')
  return page.locator('.pdf-editor-overlay')
}

async function angle(overlay: Locator) {
  return overlay.evaluate((element) => {
    const matrix = new DOMMatrix(getComputedStyle(element).transform)
    return Math.round(Math.atan2(matrix.b, matrix.a) * 180 / Math.PI)
  })
}

async function expectSeparatedControls(overlay: Locator) {
  const rotate = (await overlay.locator('.pdf-editor-rotate-handle').boundingBox())!
  const menu = (await overlay.locator('.pdf-editor-object-menu').boundingBox())!
  expect(menu.x - (rotate.x + rotate.width)).toBeGreaterThanOrEqual(5)
  expect(rotate.y).toBeCloseTo(menu.y, 1)
  expect(rotate.width).toBeCloseTo(menu.width, 1)
  expect(rotate.height).toBeCloseTo(menu.height, 1)
  for (const corner of ['nw', 'ne']) {
    const resize = (await overlay.locator(`.pdf-editor-resize.is-${corner}`).boundingBox())!
    expect(rotate.y + rotate.height).toBeLessThan(resize.y)
    expect(menu.y + menu.height).toBeLessThan(resize.y)
  }
}

test('short text controls are separate and rotation works by click and native keyboard activation', async ({ page }, testInfo) => {
  await openEditor(page)
  const overlay = await addText(page)
  await overlay.scrollIntoViewIfNeeded()
  await expectSeparatedControls(overlay)
  await page.screenshot({ path: testInfo.outputPath('short-text-controls.png') })
  const rotate = overlay.locator('.pdf-editor-rotate-handle')
  await rotate.click(); await expect.poll(() => angle(overlay)).toBe(90)
  await expect(overlay).toBeFocused()
  await rotate.press('Enter'); await expect.poll(() => angle(overlay)).toBe(180)
  await expect(overlay).toBeFocused()
  await rotate.press('Space'); await expect.poll(() => angle(overlay)).toBe(-90)
  await expect(overlay).toBeFocused()
  await rotate.press('ArrowRight'); await expect.poll(() => angle(overlay)).toBe(-75)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(() => angle(overlay)).toBe(-90)
  await overlay.focus()
  await overlay.locator('.pdf-editor-object-menu').click()
  await expect(page.getByRole('menu')).toBeVisible()
  await page.getByRole('menuitem', { name: 'Rotate 90°', exact: true }).click()
  await expect.poll(() => angle(overlay)).toBe(0)
})

test('dragging the rotation control is smooth from its new position and does not add a click rotation', async ({ page }) => {
  await openEditor(page)
  const overlay = await addText(page)
  await overlay.focus()
  const grip = overlay.locator('.pdf-editor-rotate-handle')
  await grip.scrollIntoViewIfNeeded()
  const object = (await overlay.boundingBox())!, handle = (await grip.boundingBox())!
  const cx = object.x + object.width / 2, cy = object.y + object.height / 2
  const x = handle.x + handle.width / 2, y = handle.y + handle.height / 2
  const start = Math.atan2(y - cy, x - cx), radius = Math.hypot(x - cx, y - cy)
  await page.mouse.move(x, y); await page.mouse.down()
  // A small pointer tremor must remain a click, rather than starting a jumpy drag.
  await page.mouse.move(x + 1, y + 1)
  expect(await angle(overlay)).toBe(0)
  await page.keyboard.down('Shift')
  await page.mouse.move(cx + Math.cos(start + 46 * Math.PI / 180) * radius, cy + Math.sin(start + 46 * Math.PI / 180) * radius, { steps: 8 })
  await page.mouse.up(); await page.keyboard.up('Shift')
  await expect.poll(() => angle(overlay)).toBe(45)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(() => angle(overlay)).toBe(0)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect.poll(() => angle(overlay)).toBe(45)
})

test('an image rotates directly from its floating control', async ({ page }) => {
  await openEditor(page)
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 100
    canvas.getContext('2d')!.fillRect(0, 0, 200, 100)
    const result = Array.from(atob(canvas.toDataURL().split(',')[1]), (value) => value.charCodeAt(0))
    canvas.width = canvas.height = 0
    return result
  })
  await page.locator('.pdf-editor input[type=file]').setInputFiles({ name: 'synthetic-controls.png', mimeType: 'image/png', buffer: Buffer.from(bytes) })
  const overlay = page.locator('.pdf-editor-overlay')
  await expect(overlay).toHaveCount(1)
  await overlay.locator('.pdf-editor-rotate-handle').click()
  await expect.poll(() => angle(overlay)).toBe(90)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(() => angle(overlay)).toBe(0)
})

test.describe('Spanish touch controls', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, locale: 'es-ES' })
  test('short text buttons stay apart and support tapping rotation and options', async ({ page }) => {
    await openEditor(page, true)
    const overlay = await addText(page, true)
    await overlay.scrollIntoViewIfNeeded()
    await expectSeparatedControls(overlay)
    await overlay.locator('.pdf-editor-rotate-handle').tap()
    await expect.poll(() => angle(overlay)).toBe(90)
    await expect(overlay).toBeFocused()
    await overlay.locator('.pdf-editor-object-menu').tap()
    await expect(page.getByRole('menu')).toBeVisible()
    await page.getByRole('menuitem', { name: 'Rotar 90°', exact: true }).tap()
    await expect.poll(() => angle(overlay)).toBe(180)
  })
})
