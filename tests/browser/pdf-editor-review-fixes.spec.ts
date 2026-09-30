import { test, expect, type Page, type Locator } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { readFile } from 'node:fs/promises'

async function fixture() {
  const pdf = await PDFDocument.create()
  for (let index = 0; index < 3; index++) pdf.addPage([600, 800]).drawText('Synthetic preview regression', { x: 50, y: 700 })
  return Buffer.from(await pdf.save())
}

async function openEditor(page: Page) {
  await page.goto('/edit-pdf/')
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'synthetic-review.pdf', mimeType: 'application/pdf', buffer: await fixture() })
  await expect(page.getByRole('button', { name: 'Images', exact: true })).toBeEnabled({ timeout: 15_000 })
}

async function addImage(page: Page) {
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 100
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ff0000'; context.fillRect(0, 0, 100, 100)
    context.fillStyle = '#0000ff'; context.fillRect(100, 0, 100, 100)
    const bytes = Array.from(atob(canvas.toDataURL().split(',')[1]), (character) => character.charCodeAt(0))
    canvas.width = canvas.height = 0
    return bytes
  })
  await page.locator('.pdf-editor input[type=file]').setInputFiles({ name: 'synthetic-review.png', mimeType: 'image/png', buffer: Buffer.from(bytes) })
  await expect(page.locator('.pdf-editor-overlay')).toHaveCount(1)
}

async function anchor(overlay: Locator, opposite: string) {
  return overlay.evaluate((element, corner) => {
    const paper = element.closest('.pdf-editor-paper')!.getBoundingClientRect()
    const style = (element as HTMLElement).style
    const width = parseFloat(style.width) * paper.width / 100, height = parseFloat(style.height) * paper.height / 100
    const centerX = parseFloat(style.left) * paper.width / 100 + width / 2
    const centerY = parseFloat(style.top) * paper.height / 100 + height / 2
    const matrix = new DOMMatrix(getComputedStyle(element).transform)
    const x = corner.endsWith('e') ? width / 2 : -width / 2
    const y = corner.startsWith('s') ? height / 2 : -height / 2
    return { x: centerX + matrix.a * x + matrix.c * y, y: centerY + matrix.b * x + matrix.d * y, width, height }
  }, opposite)
}

test('review: crop and download work under the exact production CSP', async ({ page }) => {
  const deployment = JSON.parse(await readFile('vercel.json', 'utf8')) as { headers: { headers: { key: string; value: string }[] }[] }
  const csp = deployment.headers.flatMap((entry) => entry.headers).find((entry) => entry.key === 'Content-Security-Policy')!.value
  expect(csp).toContain("connect-src 'self' blob:")
  expect(csp).not.toMatch(/connect-src[^;]*data:/)
  let preamble = ''
  await page.route('**/__synthetic_review_preamble.js', (route) => route.fulfill({ contentType: 'text/javascript', body: preamble }))
  await page.route('**/edit-pdf/', async (route) => {
    const response = await route.fetch()
    // Externalize only Vite's inline development preamble; keep the deployed CSP unchanged.
    const html = (await response.text()).replace(/<script type="module">([\s\S]*?)<\/script>/, (_match, code: string) => {
      preamble = code
      return '<script type="module" src="/__synthetic_review_preamble.js"></script>'
    })
    await route.fulfill({ response, body: html, headers: { ...response.headers(), 'content-security-policy': csp } })
  })
  await page.addInitScript(() => {
    Reflect.set(window, 'syntheticCspViolations', [])
    document.addEventListener('securitypolicyviolation', (event) => {
      Reflect.get(window, 'syntheticCspViolations').push({ directive: event.effectiveDirective, blocked: event.blockedURI })
    })
  })
  await openEditor(page); await addImage(page)
  await page.getByRole('button', { name: 'Crop image', exact: true }).click()
  await page.locator('.pdf-editor-crop-surface').focus()
  for (let index = 0; index < 25; index++) await page.keyboard.press('Shift+ArrowLeft')
  await page.getByRole('button', { name: 'Apply crop', exact: true }).click()
  await expect(page.locator('.pdf-editor-crop-surface')).toHaveCount(0)
  await expect(page.getByRole('alert')).toHaveCount(0)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF', exact: true }).click()
  const result = await download
  expect((await PDFDocument.load(await readFile((await result.path())!))).getPageCount()).toBe(3)
  expect(await page.evaluate(() => Reflect.get(window, 'syntheticCspViolations').filter((event: { directive: string }) => event.directive === 'connect-src'))).toEqual([])
})

for (const rotation of [0, 45]) {
  test(`review: keyboard resizing honors each opposite corner at ${rotation} degrees`, async ({ page }) => {
    await openEditor(page); await addImage(page)
    const overlay = page.locator('.pdf-editor-overlay')
    await overlay.focus()
    for (let index = 0; index < 10; index++) await overlay.press('Shift+ArrowRight')
    for (let index = 0; index < 8; index++) await overlay.press('Shift+ArrowDown')
    if (rotation) {
      await overlay.locator('.pdf-editor-rotate-handle').focus()
      for (let index = 0; index < 3; index++) await page.keyboard.press('ArrowRight')
    }
    for (const corner of ['nw', 'ne', 'sw', 'se']) {
      const opposite = ({ nw: 'se', ne: 'sw', sw: 'ne', se: 'nw' } as Record<string, string>)[corner]
      for (const key of ['Enter', 'Space', 'Shift+Enter', 'Shift+Space']) {
        await overlay.focus()
        const before = await anchor(overlay, opposite)
        await overlay.locator(`.pdf-editor-resize.is-${corner}`).press(key)
        const after = await anchor(overlay, opposite)
        expect(after.x).toBeCloseTo(before.x, 1)
        expect(after.y).toBeCloseTo(before.y, 1)
        expect(after.width / after.height).toBeCloseTo(before.width / before.height, 3)
        if (key.startsWith('Shift')) expect(after.width).toBeLessThan(before.width)
        else expect(after.width).toBeGreaterThan(before.width)
        await page.getByRole('button', { name: 'Undo', exact: true }).click()
      }
    }
  })
}

test('review: successful next-page preview clears render failure and releases failed canvas', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (...args: Parameters<typeof original>) {
      const context = original.apply(this, args)
      if (this.classList.contains('pdf-editor-canvas') && args[0] === '2d') {
        HTMLCanvasElement.prototype.getContext = original
        Reflect.set(window, 'syntheticFailedCanvas', this)
        const renderer = context as CanvasRenderingContext2D
        const save = renderer.save
        renderer.save = () => { renderer.save = save; throw new Error('synthetic preview failure') }
      }
      return context
    } as typeof original
  })
  await page.goto('/edit-pdf/')
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'synthetic-preview.pdf', mimeType: 'application/pdf', buffer: await fixture() })
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 15_000 })
  await page.getByLabel('Page', { exact: true }).selectOption('2')
  await expect(page.getByRole('button', { name: 'Images', exact: true })).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(await page.evaluate(() => {
    const canvas = Reflect.get(window, 'syntheticFailedCanvas') as HTMLCanvasElement
    return canvas.width === 0 && canvas.height === 0
  })).toBe(true)
})

test('review: successful page preview preserves unrelated image-error notice', async ({ page }) => {
  await openEditor(page)
  await page.locator('.pdf-editor input[type=file]').setInputFiles({ name: 'synthetic-invalid.png', mimeType: 'image/png', buffer: Buffer.from('synthetic invalid image') })
  await expect(page.getByRole('alert')).toBeVisible()
  const error = await page.getByRole('alert').textContent()
  await page.getByLabel('Page', { exact: true }).selectOption('2')
  await expect(page.getByRole('button', { name: 'Images', exact: true })).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveText(error!)
})
