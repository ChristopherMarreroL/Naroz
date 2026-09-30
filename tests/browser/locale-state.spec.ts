import { test, expect, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

async function openSpanishEditor(page: Page) {
  await page.addInitScript(() => localStorage.setItem('naroz-locale-preference-v2', 'es'))
  const pdf = await PDFDocument.create()
  pdf.addPage([600, 800])
  await page.goto('/edit-pdf/')
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'synthetic-locale.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save()) })
  await page.getByRole('button', { name: 'Agregar texto', exact: true }).click()
  await page.locator('.pdf-editor-paper').click({ position: { x: 90, y: 120 } })
  const input = page.getByRole('textbox', { name: 'Texto para agregar' })
  await input.fill('Texto persistente')
  await input.press('Control+Enter')
  await expect(page.locator('.pdf-editor-overlay')).toHaveCount(1)
  await page.locator('.pdf-editor-overlay').evaluate(element => element.setAttribute('data-mounted-before-locale', 'yes'))
}

test('lazy language loading preserves the mounted editor, overlays and undo history', async ({ page }) => {
  await openSpanishEditor(page)
  let release = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  let requested = () => {}
  const loading = new Promise<void>(resolve => { requested = resolve })
  await page.route('**/messages.en.ts*', async route => { requested(); await gate; await route.continue() })
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await loading
  await expect(page.getByRole('button', { name: 'Agregar texto', exact: true })).toBeEnabled()
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await expect(page.locator('.pdf-editor-overlay')).toHaveAttribute('data-mounted-before-locale', 'yes')
  release()
  await expect(page.getByRole('button', { name: 'Add text', exact: true })).toBeEnabled()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('.pdf-editor-overlay')).toHaveAttribute('data-mounted-before-locale', 'yes')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.pdf-editor-overlay')).toHaveCount(0)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(page.locator('.pdf-editor-overlay')).toContainText('Texto persistente')
})

test('a stale language response cannot override the latest language choice', async ({ page }) => {
  await openSpanishEditor(page)
  let release = () => {}
  const gate = new Promise<void>(resolve => { release = resolve })
  let requested = () => {}
  const loading = new Promise<void>(resolve => { requested = resolve })
  await page.route('**/messages.en.ts*', async route => { requested(); await gate; await route.continue() })
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await loading
  await page.getByRole('button', { name: 'ES', exact: true }).click()
  release()
  await expect(page.getByRole('button', { name: 'Agregar texto', exact: true })).toBeEnabled()
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await expect(page.locator('.pdf-editor-overlay')).toHaveAttribute('data-mounted-before-locale', 'yes')
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Add text', exact: true })).toBeEnabled()
  await expect(page.locator('.pdf-editor-overlay')).toHaveAttribute('data-mounted-before-locale', 'yes')
})

test('a failed language chunk keeps the previous language and editor state intact', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openSpanishEditor(page)
  const failed = page.waitForEvent('requestfailed', request => request.url().includes('/messages.en.ts'))
  await page.route('**/messages.en.ts*', route => route.abort('failed'))
  await page.getByRole('button', { name: 'EN', exact: true }).click()
  await failed
  await expect(page.locator('.pdf-editor-overlay')).toHaveAttribute('data-mounted-before-locale', 'yes')
  await expect(page.getByRole('button', { name: 'Agregar texto', exact: true })).toBeEnabled()
  await expect(page.locator('html')).toHaveAttribute('lang', 'es')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('naroz-locale-preference-v2'))).toBe('es')
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click()
  await expect(page.locator('.pdf-editor-overlay')).toHaveCount(0)
  expect(errors).toEqual([])
})
