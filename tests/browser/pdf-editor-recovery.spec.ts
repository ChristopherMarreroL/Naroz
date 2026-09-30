import { test, expect, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'

async function fixture(empty = false) {
  const pdf = await PDFDocument.create()
  if (!empty) pdf.addPage([600, 800])
  return Buffer.from(await pdf.save({ addDefaultPage: false }))
}

async function openEditor(page: Page) {
  await page.goto('/edit-pdf/')
  await page.locator('.upload-dropzone input[type=file]').setInputFiles({ name: 'synthetic-recovery.pdf', mimeType: 'application/pdf', buffer: await fixture() })
  await expect(page.getByRole('button', { name: 'Images', exact: true })).toBeEnabled()
}

test('a zero-page PDF is rejected without an unusable session and a valid PDF can be opened afterward', async ({ page }) => {
  await page.goto('/edit-pdf/')
  const input = page.locator('.upload-dropzone input[type=file]')
  await input.setInputFiles({ name: 'synthetic-empty.pdf', mimeType: 'application/pdf', buffer: await fixture(true) })
  await expect(page.getByRole('alert')).toContainText('Could not open the PDF')
  await expect(page.locator('.pdf-editor-controls')).toHaveCount(0)
  await expect(page.locator('.pdf-editor-canvas')).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveCount(0)
  await input.setInputFiles({ name: 'synthetic-valid.pdf', mimeType: 'application/pdf', buffer: await fixture() })
  await expect(page.getByRole('button', { name: 'Images', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Download PDF', exact: true })).toBeEnabled()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('fullscreen enter and exit errors clear only after their successful retries', async ({ page }) => {
  await page.addInitScript(() => {
    const enter = Element.prototype.requestFullscreen
    const exit = document.exitFullscreen.bind(document)
    let enters = 0, exits = 0
    Element.prototype.requestFullscreen = async function () {
      if (enters++ === 0) throw new Error('synthetic enter denial')
      await enter.call(this)
    }
    document.exitFullscreen = async () => {
      if (exits++ === 0) throw new Error('synthetic exit denial')
      await exit()
    }
  })
  await openEditor(page)
  await page.getByRole('button', { name: 'Full screen', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('The browser did not allow full screen')
  await page.getByRole('button', { name: 'Full screen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Exit full screen', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: 'Exit full screen', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('The browser did not allow full screen')
  await expect(page.getByRole('button', { name: 'Exit full screen', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Exit full screen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Full screen', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('successful fullscreen changes preserve an unrelated image error', async ({ page }) => {
  await openEditor(page)
  await page.locator('.pdf-editor input[type=file]').setInputFiles({ name: 'synthetic-invalid.png', mimeType: 'image/png', buffer: Buffer.from('synthetic invalid image') })
  await expect(page.getByRole('alert')).toBeVisible()
  const error = await page.getByRole('alert').textContent()
  await page.getByRole('button', { name: 'Full screen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Exit full screen', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('alert')).toHaveText(error!)
  await page.getByRole('button', { name: 'Exit full screen', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Full screen', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('alert')).toHaveText(error!)
})

test('preview glyph positions retain repeated spaces and tabs measured for export', async ({ page }) => {
  await openEditor(page)
  await page.getByRole('button', { name: 'Add text', exact: true }).click()
  await page.locator('.pdf-editor-paper').click({ position: { x: 90, y: 120 } })
  const input = page.getByRole('textbox', { name: 'Text to add', exact: true })
  await input.fill('A   B\nC\t\tD')
  await input.press('Control+Enter')
  const nodes = page.locator('.pdf-editor-text-preview text')
  await expect(nodes).toHaveCount(2)
  // Compare at the export font size so scaled SVG font hinting cannot affect the measurements.
  await page.locator('.pdf-editor-text-preview').evaluate((node) => {
    const svg = node as SVGSVGElement
    document.body.appendChild(svg)
    svg.style.position = 'fixed'
    svg.style.width = `${svg.viewBox.baseVal.width}px`
    svg.style.height = `${svg.viewBox.baseVal.height}px`
  })
  const measurements = await nodes.evaluateAll((nodes) => nodes.map((node) => {
    const text = node as SVGTextElement
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d')!
    const style = getComputedStyle(text)
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
    const raw = text.textContent ?? ''
    const collapsed = raw.replace(/\s+/g, ' ')
    const expected = context.measureText(raw).width - context.measureText(collapsed).width
    const originalWidth = text.getComputedTextLength()
    const originalCount = text.getNumberOfChars()
    const comparison = text.cloneNode(true) as SVGTextElement
    comparison.textContent = collapsed
    text.parentElement!.appendChild(comparison)
    const actual = originalWidth - comparison.getComputedTextLength()
    comparison.remove()
    canvas.width = canvas.height = 0
    return { expected, actual, originalCount, inputCount: raw.length }
  }))
  for (const entry of measurements) {
    expect(entry.originalCount).toBe(entry.inputCount)
    expect(Math.abs(entry.actual - entry.expected), JSON.stringify(entry)).toBeLessThan(.1)
  }
})
