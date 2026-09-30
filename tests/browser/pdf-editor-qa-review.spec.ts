import { test, expect, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

async function syntheticPdf() {
  const pdf = await PDFDocument.create()
  pdf.addPage([600, 800]).drawText('Synthetic baseline', { x: 50, y: 700 })
  pdf.addPage([600, 800])
  return Buffer.from(await pdf.save())
}

async function openEditor(page: Page) {
  await page.goto('/edit-pdf/')
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'synthetic-qa.pdf', mimeType: 'application/pdf', buffer: await syntheticPdf() })
  await expect(page.getByRole('button', { name: 'Images', exact: true })).toBeEnabled({ timeout: 15_000 })
}

async function syntheticImage(page: Page) {
  return Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 100
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ff0000'; context.fillRect(0, 0, 100, 100)
    context.fillStyle = '#0000ff'; context.fillRect(100, 0, 100, 100)
    const bytes = Array.from(atob(canvas.toDataURL().split(',')[1]), (character) => character.charCodeAt(0))
    canvas.width = canvas.height = 0
    return bytes
  }))
}

async function addImage(page: Page) {
  await page.locator('.pdf-editor input[type=file]').setInputFiles({ name: 'synthetic-qa.png', mimeType: 'image/png', buffer: await syntheticImage(page) })
  await expect(page.locator('.pdf-editor-overlay')).toHaveCount(1)
}

async function addText(page: Page, text: string) {
  await page.getByRole('button', { name: 'Add text', exact: true }).click()
  await page.locator('.pdf-editor-paper').click({ position: { x: 100, y: 140 } })
  const input = page.getByRole('textbox', { name: 'Text to add' })
  await input.fill(text)
  await input.press('Control+Enter')
}

test('QA: each corner resizes proportionally around its opposite anchor and undo restores it', async ({ page }) => {
  await openEditor(page); await addImage(page)
  const overlay = page.locator('.pdf-editor-overlay')
  await overlay.focus()
  // Move into the center so all outward corner directions have room.
  for (let index = 0; index < 10; index++) await overlay.press('Shift+ArrowRight')
  for (let index = 0; index < 8; index++) await overlay.press('Shift+ArrowDown')
  for (const corner of ['nw', 'ne', 'sw', 'se']) {
    await overlay.focus()
    const handle = overlay.locator(`.pdf-editor-resize.is-${corner}`)
    await handle.scrollIntoViewIfNeeded()
    const original = (await overlay.boundingBox())!, handleBox = (await handle.boundingBox())!
    const sx = corner.endsWith('e') ? 1 : -1, sy = corner.startsWith('s') ? 1 : -1
    const opposite = { x: sx > 0 ? original.x : original.x + original.width, y: sy > 0 ? original.y : original.y + original.height }
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
    await page.mouse.down(); await page.mouse.move(handleBox.x + handleBox.width / 2 + sx * 35, handleBox.y + handleBox.height / 2 + sy * 18, { steps: 5 }); await page.mouse.up()
    const resized = (await overlay.boundingBox())!
    expect(resized.width).toBeGreaterThan(original.width)
    expect(resized.width / resized.height).toBeCloseTo(original.width / original.height, 2)
    expect(sx > 0 ? resized.x : resized.x + resized.width).toBeCloseTo(opposite.x, 0)
    expect(sy > 0 ? resized.y : resized.y + resized.height).toBeCloseTo(opposite.y, 0)
    await page.getByRole('button', { name: 'Undo', exact: true }).click()
    expect((await overlay.boundingBox())!.width).toBeCloseTo(original.width, 0)
  }
})

test('QA: failed image input and failed crop can both retry without losing the original', async ({ page }) => {
  await openEditor(page)
  await page.locator('.pdf-editor input[type=file]').setInputFiles({ name: 'synthetic-invalid.png', mimeType: 'image/png', buffer: Buffer.from('invalid synthetic image') })
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Images', exact: true })).toBeEnabled()
  await addImage(page)
  const image = page.locator('.pdf-editor-overlay img'), original = await image.getAttribute('src')
  await page.getByRole('button', { name: 'Crop image', exact: true }).click()
  await page.evaluate(() => {
    const original = window.createImageBitmap
    window.createImageBitmap = (() => {
      window.createImageBitmap = original
      return Promise.reject(new Error('synthetic decoding failure'))
    }) as typeof window.createImageBitmap
  })
  await page.getByRole('button', { name: 'Apply crop', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Apply crop', exact: true })).toBeEnabled()
  expect(await image.getAttribute('src')).toBe(original)
  await page.locator('.pdf-editor-crop-surface').focus()
  for (let index = 0; index < 10; index++) await page.keyboard.press('Shift+ArrowLeft')
  await page.getByRole('button', { name: 'Apply crop', exact: true }).click()
  await expect(page.locator('.pdf-editor-crop-surface')).toHaveCount(0)
  expect(await image.getAttribute('src')).not.toBe(original)
})

test('QA: export failure leaves work dirty and retry succeeds with identical text', async ({ page }) => {
  await openEditor(page); await addText(page, 'First synthetic line\nSecond synthetic line')
  await page.evaluate(() => {
    const original = URL.createObjectURL
    URL.createObjectURL = ((blob: Blob) => {
      if (blob.type === 'application/pdf') { URL.createObjectURL = original; throw new Error('synthetic download failure') }
      return original(blob)
    }) as typeof URL.createObjectURL
  })
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled()
  await expect(page.locator('.pdf-editor-heading')).toContainText('Changes not downloaded')
  await expect(page.locator('.pdf-editor-text-preview text')).toHaveText(['First synthetic line', 'Second synthetic line'])
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click(); await download
  await expect(page.locator('.pdf-editor-heading')).toContainText('PDF downloaded')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('QA: oversized text stays editable and correcting the draft can export', async ({ page }) => {
  await openEditor(page); await addText(page, 'W'.repeat(2000))
  const input = page.getByRole('textbox', { name: 'Text to add' })
  await expect(input).toHaveValue('W'.repeat(2000))
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('.pdf-editor-overlay')).toHaveCount(0)
  await input.fill('Corrected synthetic draft'); await input.press('Control+Enter')
  await expect(input).toHaveCount(0)
  await expect(page.locator('.pdf-editor-text-preview text')).toHaveText('Corrected synthetic draft')
  await expect(page.getByRole('alert')).toHaveCount(0)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click(); await download
})

test('QA: successful image retry clears its obsolete error message', async ({ page }) => {
  await openEditor(page)
  await page.locator('.pdf-editor input[type=file]').setInputFiles({ name: 'synthetic-invalid.png', mimeType: 'image/png', buffer: Buffer.from('invalid synthetic image') })
  await expect(page.getByRole('alert')).toBeVisible()
  await addImage(page)
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('QA: pending decode blocks conflicting controls and cancelling navigation retains import', async ({ page }) => {
  await openEditor(page)
  const bytes = await syntheticImage(page)
  await page.evaluate(() => {
    const original = window.createImageBitmap
    window.createImageBitmap = ((...args: Parameters<typeof window.createImageBitmap>) => new Promise((resolve, reject) => {
      Reflect.set(window, 'releaseSyntheticDecode', () => { window.createImageBitmap = original; original(...args).then(resolve, reject) })
    })) as typeof window.createImageBitmap
  })
  await page.locator('.pdf-editor input[type=file]').setInputFiles({ name: 'synthetic-pending.png', mimeType: 'image/png', buffer: bytes })
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Images', exact: true })).toBeDisabled()
  await expect(page.getByLabel('Page', { exact: true })).toBeDisabled()
  page.once('dialog', (dialog) => dialog.dismiss())
  await page.locator('.topbar-brand-button').click()
  await expect(page).toHaveURL(/edit-pdf/)
  await expect.poll(() => page.evaluate(() => typeof Reflect.get(window, 'releaseSyntheticDecode'))).toBe('function')
  await page.evaluate(() => Reflect.get(window, 'releaseSyntheticDecode')())
  await expect(page.locator('.pdf-editor-overlay')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled()
})

test('QA: dragging rotation snaps to 15 degrees and cropped rotated image retains visual position', async ({ page }) => {
  await openEditor(page); await addImage(page)
  const overlay = page.locator('.pdf-editor-overlay')
  await overlay.focus()
  for (let index = 0; index < 10; index++) await overlay.press('Shift+ArrowRight')
  for (let index = 0; index < 8; index++) await overlay.press('Shift+ArrowDown')
  const handle = overlay.locator('.pdf-editor-rotate-handle')
  await handle.scrollIntoViewIfNeeded()
  const initial = (await overlay.boundingBox())!, grip = (await handle.boundingBox())!
  const center = { x: initial.x + initial.width / 2, y: initial.y + initial.height / 2 }
  const startAngle = Math.atan2(grip.y + grip.height / 2 - center.y, grip.x + grip.width / 2 - center.x)
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2); await page.mouse.down()
  await page.keyboard.down('Shift')
  await page.mouse.move(center.x + Math.cos(startAngle + 61 * Math.PI / 180) * 90, center.y + Math.sin(startAngle + 61 * Math.PI / 180) * 90, { steps: 5 })
  await page.mouse.up(); await page.keyboard.up('Shift')
  expect(await overlay.evaluate((element) => {
    const matrix = new DOMMatrix(getComputedStyle(element).transform)
    return Math.atan2(matrix.b, matrix.a) * 180 / Math.PI
  })).toBeCloseTo(60, 1)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await overlay.focus()
  await page.getByRole('button', { name: 'Rotate 90°', exact: true }).click()
  const before = (await overlay.boundingBox())!
  const paperBefore = (await page.locator('.pdf-editor-paper').boundingBox())!
  await page.getByRole('button', { name: 'Crop image', exact: true }).click()
  await page.locator('.pdf-editor-crop-surface').focus()
  for (let index = 0; index < 25; index++) await page.keyboard.press('Shift+ArrowLeft')
  for (let index = 0; index < 25; index++) await page.keyboard.press('ArrowRight')
  await page.getByRole('button', { name: 'Apply crop', exact: true }).click()
  await expect(page.locator('.pdf-editor-crop-surface')).toHaveCount(0)
  const cropped = (await overlay.boundingBox())!
  const paperAfter = (await page.locator('.pdf-editor-paper').boundingBox())!
  expect(cropped.width).toBeCloseTo(before.width, 0)
  expect(cropped.height).toBeCloseTo(before.height / 2, 0)
  expect(cropped.x).toBeCloseTo(before.x, 0)
  expect(cropped.y - paperAfter.y).toBeCloseTo(before.y - paperBefore.y + before.height / 2, 0)
  const color = await overlay.locator('img').evaluate(async (image) => {
    const bitmap = await createImageBitmap(image as HTMLImageElement)
    const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height
    const context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0)
    const sample = Array.from(context.getImageData(Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1).data)
    bitmap.close(); canvas.width = canvas.height = 0
    return sample
  })
  expect(color).toEqual([0, 0, 255, 255])
})
