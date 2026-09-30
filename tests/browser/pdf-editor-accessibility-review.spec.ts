import { test, expect, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

async function openSyntheticPdf(page: Page) {
  const pdf = await PDFDocument.create()
  pdf.addPage([600, 800]).drawText('Synthetic accessibility fixture')
  await page.goto('/edit-pdf/')
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'synthetic-accessibility.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) })
  await expect(page.locator('.pdf-editor-page-loading')).toHaveCount(0, { timeout: 15000 })
  await expect(page.locator('.pdf-editor-canvas')).toBeVisible()
  await expect(page.locator('.pdf-editor input[type=file]')).toBeEnabled({ timeout: 15000 })
}

async function addSyntheticImage(page: Page) {
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 120; canvas.height = 80
    canvas.getContext('2d')!.fillRect(0, 0, 120, 80)
    const binary = atob(canvas.toDataURL().split(',')[1])
    canvas.width = canvas.height = 0
    return Array.from(binary, (char) => char.charCodeAt(0))
  })
  await page.locator('.pdf-editor input[type=file]').setInputFiles({ name: 'synthetic-image.png', mimeType: 'image/png', buffer: Buffer.from(bytes) })
  await expect(page.locator('.pdf-editor-overlay')).toHaveCount(1)
}

test('keyboard crop starts focused and cancellation and application restore the image focus', async ({ page }) => {
  await openSyntheticPdf(page)
  await addSyntheticImage(page)
  const image = page.locator('.pdf-editor-overlay')
  await image.focus()
  await image.press('Shift+F10')
  await page.getByRole('menuitem', { name: 'Crop image', exact: true }).press('Enter')
  const crop = page.locator('.pdf-editor-crop-surface')
  await expect(crop).toBeFocused()
  await crop.press('Shift+ArrowLeft')
  await crop.press('Escape')
  await expect(crop).toHaveCount(0)
  await expect(image).toBeFocused()
  await image.press('Shift+F10')
  await page.getByRole('menuitem', { name: 'Crop image', exact: true }).press('Enter')
  await expect(crop).toBeFocused()
  await page.getByRole('button', { name: 'Cancel', exact: true }).press('Enter')
  await expect(image).toBeFocused()
  await image.press('Shift+F10')
  await page.getByRole('menuitem', { name: 'Crop image', exact: true }).press('Enter')
  await crop.press('Shift+ArrowLeft')
  await page.getByRole('button', { name: 'Apply crop', exact: true }).press('Enter')
  await expect(crop).toHaveCount(0)
  await expect(image).toBeFocused()
})

test('image role buttons activate their options with Enter and Space', async ({ page }) => {
  await openSyntheticPdf(page)
  await addSyntheticImage(page)
  const image = page.locator('.pdf-editor-overlay')
  for (const key of ['Enter', 'Space']) {
    await image.focus()
    await image.press(key)
    await expect(page.getByRole('menu', { name: 'Element options' })).toBeVisible()
    await page.getByRole('menu').press('Escape')
    await expect(image).toBeFocused()
  }
})

test('unsupported optional browser APIs leave the editor usable', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'queryLocalFonts', { value: undefined, configurable: true })
    Object.defineProperty(Element.prototype, 'requestFullscreen', { value: undefined, configurable: true })
  })
  await openSyntheticPdf(page)
  await expect(page.getByRole('button', { name: 'Show all device fonts' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Full screen', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('The browser did not allow full screen. You can continue editing here.')
  await addSyntheticImage(page)
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled()
})

test('Spanish touch layout remains accessible in narrow portrait and short landscape', async ({ browser }, testInfo) => {
  const context = await browser.newContext({ locale: 'es-VE', viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  await openSyntheticPdf(page)
  await expect(page.getByRole('heading', { name: 'Editar PDF', exact: true })).toBeVisible()
  await addSyntheticImage(page)
  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport)
    await page.getByRole('button', { name: 'Miniaturas de páginas', exact: true }).tap()
    await expect(page.getByRole('navigation', { name: 'Miniaturas de páginas' })).toBeVisible()
    const bounds = await page.evaluate(() => ({ viewport: window.innerWidth, width: document.documentElement.scrollWidth }))
    expect(bounds.width).toBeLessThanOrEqual(bounds.viewport + 1)
    const image = page.locator('.pdf-editor-overlay')
    await image.scrollIntoViewIfNeeded()
    await image.tap()
    await page.getByRole('button', { name: 'Opciones del elemento', exact: true }).tap()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    const box = (await menu.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
    await menu.press('Escape')
    await page.getByRole('button', { name: 'Miniaturas de páginas', exact: true }).tap()
    await expect(page.getByRole('navigation', { name: 'Miniaturas de páginas' })).toHaveCount(0)
  }
  await page.screenshot({ path: testInfo.outputPath('spanish-touch-landscape.png'), fullPage: true })
  await context.close()
})

test('an explicit English preference overrides a Spanish device without Spanish editor text', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'es-VE' })
  await context.addInitScript(() => localStorage.setItem('naroz-locale-preference-v2', 'en'))
  const page = await context.newPage()
  await openSyntheticPdf(page)
  await expect(page.getByRole('heading', { name: 'Edit PDF', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Agregar texto', exact: true })).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await context.close()
})

test('IME composition keys do not discard or confirm an unfinished text draft', async ({ page }) => {
  await openSyntheticPdf(page)
  await page.getByRole('button', { name: 'Add text', exact: true }).press('Enter')
  const draft = page.getByRole('textbox', { name: 'Text to add', exact: true })
  await draft.fill('Draft containing 日本語')
  await draft.dispatchEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true, bubbles: true })
  await expect(draft).toHaveValue('Draft containing 日本語')
  await draft.dispatchEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true })
  await expect(draft).toHaveValue('Draft containing 日本語')
  await draft.dispatchEvent('keydown', { key: 'Escape', keyCode: 229, bubbles: true })
  await expect(draft).toHaveValue('Draft containing 日本語')
  await draft.press('Escape')
  await expect(draft).toHaveCount(0)
})

test('accessible overlay names identify image type and text content while text Enter still edits', async ({ page }) => {
  await openSyntheticPdf(page)
  await addSyntheticImage(page)
  await expect(page.locator('.pdf-editor-overlay')).toHaveAccessibleName(/Added element.*1.*Image/)
  await page.getByRole('button', { name: 'Add text', exact: true }).press('Enter')
  const draft = page.getByRole('textbox', { name: 'Text to add', exact: true })
  await draft.fill('Accessible text ñ')
  await draft.press('Control+Enter')
  const text = page.getByRole('button', { name: /Added element.*2.*Text: Accessible text ñ/ })
  await expect(text).toBeVisible()
  await text.press('Enter')
  await expect(draft).toHaveValue('Accessible text ñ')
  await draft.press('Escape')
  await expect(text).toBeFocused()
})
