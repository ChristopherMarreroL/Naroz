import { expect, test } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { PDFDocument } from 'pdf-lib'
import { Document, Packer, Paragraph } from 'docx'
import JSZip from 'jszip'

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/harness.html')
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
})

test('encrypted mixed merge preserves visible pages, rotation and normal PDF text', async ({ page }, testInfo) => {
  const result = await page.evaluate(async () => {
    const modulePath = '/src/lib/fileCompatibility/pdf.ts'
    const runtimePath = '/src/lib/fileCompatibility/pdfRuntime.ts'
    const libPath = '/tests/browser/helpers.ts'
    const { openPdfForEditing, validatePdfOutput } = await import(modulePath)
    const { createPdfLoadingTask } = await import(runtimePath)
    const { PDFDocument } = await import(libPath)
    const output = await PDFDocument.create()
    const budget = { pixels: 0, bytes: 0 }
    const routes: string[] = []
    for (const name of ['normal', 'protected']) {
      const bytes = await (await fetch(`/tests/fixtures/compatibility/${name}.pdf`)).arrayBuffer()
      const source = await openPdfForEditing(bytes)
      try {
        routes.push(source.preflight.status)
        await source.appendTo(output, [0, 1, 2], budget)
      } finally { await source.dispose() }
    }
    const bytes = await output.save()
    await validatePdfOutput(bytes, 6, [4])
    const task = createPdfLoadingTask(bytes)
    const originalTask = createPdfLoadingTask(await (await fetch('/tests/fixtures/compatibility/protected.pdf')).arrayBuffer())
    const pdf = await task.promise
    const original = await originalTask.promise
    const differences: number[] = []
    const visible: number[] = []
    const geometry: boolean[] = []
    let preview = ''
    try {
      for (let index = 1; index <= 3; index++) {
        const canvases: HTMLCanvasElement[] = []
        const sizes: number[][] = []
        for (const [document, number] of [[original, index], [pdf, index + 3]]) {
          const page = await document.getPage(number)
          try {
            const viewport = page.getViewport({ scale: 1 })
            sizes.push([viewport.width, viewport.height])
            const canvas = window.document.createElement('canvas')
            canvas.width = viewport.width; canvas.height = viewport.height
            const context = canvas.getContext('2d')!
            await page.render({ canvas, canvasContext: context, viewport, background: 'white' }).promise
            canvases.push(canvas)
          } finally { page.cleanup() }
        }
        geometry.push(JSON.stringify(sizes[0]) === JSON.stringify(sizes[1]))
        const pixels = canvases.map((canvas) => canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data)
        let difference = 0; let nonWhite = 0
        for (let offset = 0; offset < pixels[0].length; offset += 4) {
          if (pixels[1][offset] < 230 || pixels[1][offset + 1] < 230 || pixels[1][offset + 2] < 230) nonWhite++
          for (let channel = 0; channel < 3; channel++) difference += Math.abs(pixels[0][offset + channel] - pixels[1][offset + channel])
        }
        visible.push(nonWhite / (pixels[0].length / 4))
        differences.push(difference / (pixels[0].length / 4 * 3))
        if (index === 1) {
          const comparison = document.createElement('canvas')
          comparison.width = canvases[0].width * 2
          comparison.height = canvases[0].height
          const context = comparison.getContext('2d')!
          context.drawImage(canvases[0], 0, 0)
          context.drawImage(canvases[1], canvases[0].width, 0)
          preview = comparison.toDataURL('image/png').split(',')[1]
          comparison.width = 0; comparison.height = 0
        }
        canvases.forEach((canvas) => { canvas.width = 0; canvas.height = 0 })
      }
      const textPage = await pdf.getPage(1)
      const content = await textPage.getTextContent()
      textPage.cleanup()
      return { routes, count: pdf.numPages, geometry, visible, differences, textItems: content.items.length, budget, preview }
    } finally { await task.destroy(); await originalTask.destroy() }
  })
  expect(result.routes).toEqual(['normal', 'compatibility-required'])
  expect(result.count).toBe(6)
  expect(result.geometry).toEqual([true, true, true])
  result.visible.forEach((fraction) => expect(fraction).toBeGreaterThan(0.15))
  result.differences.forEach((difference) => expect(difference).toBeLessThan(8))
  expect(result.textItems).toBeGreaterThan(0)
  await writeFile(testInfo.outputPath('synthetic-comparison.png'), Buffer.from(result.preview, 'base64'))
})

test('requires an opening password and rejects a mismatched output count', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/src/lib/fileCompatibility/pdf.ts'
    const { openPdfForEditing, validatePdfOutput } = await import(path)
    const fixture = async (name: string) => (await fetch(`/tests/fixtures/compatibility/${name}.pdf`)).arrayBuffer()
    let password = ''; let invalidOutput = ''
    try { await openPdfForEditing(await fixture('password')) } catch (error) { password = (error as Error).message }
    try { await validatePdfOutput(new Uint8Array(await fixture('normal')), 9, [1]) } catch (error) { invalidOutput = (error as Error).message }
    return { password, invalidOutput }
  })
  expect(result).toEqual({ password: 'PDF_PASSWORD_REQUIRED', invalidOutput: 'PDF_OUTPUT_INVALID' })
})

test('multipage processing releases canvases and workers on finish and cancellation', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/src/lib/fileCompatibility/pdf.ts'
    const libPath = '/tests/browser/helpers.ts'
    const { openPdfForEditing, validatePdfOutput } = await import(path)
    const { PDFDocument } = await import(libPath)
    const create = document.createElement.bind(document)
    const canvases: HTMLCanvasElement[] = []
    let controller: AbortController | undefined
    document.createElement = ((name: string, options?: ElementCreationOptions) => {
      const element = create(name, options)
      if (name === 'canvas') {
        canvases.push(element as HTMLCanvasElement)
        if (controller) queueMicrotask(() => controller?.abort())
      }
      return element
    }) as typeof document.createElement
    const start = performance.now()
    let cancelled = false
    try {
      const fixture = await (await fetch('/tests/fixtures/compatibility/multipage.pdf')).arrayBuffer()
      for (let iteration = 0; iteration < 2; iteration++) {
        const pdf = await openPdfForEditing(fixture.slice(0))
        try {
          const output = await PDFDocument.create()
          await pdf.appendTo(output, Array.from({ length: 12 }, (_, index) => index), { pixels: 0, bytes: 0 })
          await validatePdfOutput(await output.save(), 12, [1])
        } finally { await pdf.dispose() }
      }
      controller = new AbortController()
      const pdf = await openPdfForEditing(fixture.slice(0), controller.signal)
      try {
        await pdf.appendTo(await PDFDocument.create(), [0, 1, 2], { pixels: 0, bytes: 0 })
      } catch { cancelled = controller.signal.aborted } finally { await pdf.dispose() }
      return { elapsedMs: Math.round(performance.now() - start), canvases: canvases.length, retainedPixels: canvases.reduce((total, canvas) => total + canvas.width * canvas.height, 0), cancelled }
    } finally { document.createElement = create }
  })
  expect(result.cancelled).toBe(true)
  expect(result.canvases).toBeGreaterThanOrEqual(25)
  expect(result.retainedPixels).toBe(0)
  await expect.poll(() => page.workers().length).toBe(0)
  console.log('Synthetic PDF lifecycle measurement:', result)
})

test('deleting pages uses the same compatibility path and respects retained geometry', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/src/lib/fileCompatibility/pdf.ts'
    const libPath = '/tests/browser/helpers.ts'
    const { openPdfForEditing, validatePdfOutput } = await import(path)
    const { PDFDocument } = await import(libPath)
    const source = await openPdfForEditing(await (await fetch('/tests/fixtures/compatibility/protected.pdf')).arrayBuffer())
    try {
      const output = await PDFDocument.create()
      await source.appendTo(output, [1], { pixels: 0, bytes: 0 })
      const bytes = await output.save()
      await validatePdfOutput(bytes, 1, [1])
      const loaded = await PDFDocument.load(bytes)
      return { count: loaded.getPageCount(), size: loaded.getPage(0).getSize() }
    } finally { await source.dispose() }
  })
  expect(result).toEqual({ count: 1, size: { width: 595, height: 420 } })
})

test('merge hook revokes downloads, resets active rendering, retries and cancels on unmount', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const path = '/tests/browser/harness.tsx'
    const { mountPdfMergerHarness } = await import(path)
    const fixture = await (await fetch('/tests/fixtures/compatibility/protected.pdf')).arrayBuffer()
    const files = () => [new File([fixture], 'synthetic.pdf', { type: 'application/pdf' })]
    const tick = () => new Promise((resolve) => setTimeout(resolve, 30))
    const revoked: string[] = []
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.revokeObjectURL = (url: string) => { revoked.push(url); revoke(url) }
    const harness = await mountPdfMergerHarness()
    let unmounted = false
    const create = document.createElement.bind(document)
    try {
      const success = await harness.get().mergePdfFiles(files())
      await tick()
      harness.get().resetMergeState()
      await tick()
      const resetResult = harness.get().result === null && revoked.includes(success.url)
      let cancel: (() => void) | undefined = () => harness.get().resetMergeState()
      document.createElement = ((name: string, options?: ElementCreationOptions) => {
        const element = create(name, options)
        if (name === 'canvas' && cancel) {
          const action = cancel; cancel = undefined
          queueMicrotask(action)
        }
        return element
      }) as typeof document.createElement
      const cancelled = await harness.get().mergePdfFiles(files())
      await tick()
      const resetIdle = !harness.get().isProcessing && harness.get().result === null
      const retry = await harness.get().mergePdfFiles(files())
      await tick()
      cancel = () => { harness.unmount(); unmounted = true }
      const removed = await harness.get().mergePdfFiles(files())
      return { resetResult, cancelled: cancelled === null, resetIdle, retry: !!retry, removed: removed === null, unmounted, retryUrlRevoked: revoked.includes(retry.url) }
    } finally {
      if (!unmounted) harness.unmount()
      document.createElement = create
      URL.revokeObjectURL = revoke
    }
  })
  expect(Object.values(result).every(Boolean)).toBe(true)
  await expect.poll(() => page.workers().length).toBe(0)
})

test('merge UI downloads a validated PDF and announces normalization', async ({ page }, testInfo) => {
  await page.goto('/document-merge-pdf')
  await page.locator('input[type=file]').setInputFiles([
    'tests/fixtures/compatibility/normal.pdf', 'tests/fixtures/compatibility/protected.pdf',
  ])
  await page.getByRole('button', { name: 'Merge PDF', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'text is no longer selectable' })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download merged PDF', exact: true }).click()
  const downloaded = await download
  const path = testInfo.outputPath('synthetic-merged.pdf')
  await downloaded.saveAs(path)
  expect((await PDFDocument.load(await readFile(path))).getPageCount()).toBe(6)
})

test('Spanish mobile PDF tools explain password protection without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => localStorage.setItem('naroz-locale-preference-v2', 'es'))
  for (const route of ['/document-delete-pages', '/pdf-to-office']) {
    await page.goto(route)
    await page.locator('input[type=file]').setInputFiles('tests/fixtures/compatibility/password.pdf')
    await expect(page.getByText('Este PDF está protegido con contraseña. Utiliza una versión desbloqueada para poder procesarlo.', { exact: true }).first()).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('Word UI merges synthetic documents through the real worker and validates its download', async ({ page }, testInfo) => {
  const documents = await Promise.all(['FIRST SYNTHETIC DOCUMENT', 'SECOND SYNTHETIC DOCUMENT'].map(async (text, index) => ({
    name: `synthetic-${index}.docx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph(text)] }] })),
  })))
  await page.goto('/document-merge-docx')
  await page.locator('input[type=file]').setInputFiles(documents)
  await page.getByRole('button', { name: 'Merge Word', exact: true }).click()
  const button = page.getByRole('button', { name: 'Download merged Word file', exact: true })
  // CI pays the first-load cost for both the DOCX worker and its ZIP/XML modules.
  await expect(button).toBeVisible({ timeout: 70_000 })
  const download = page.waitForEvent('download')
  await button.click()
  const path = testInfo.outputPath('synthetic-merged.docx')
  await (await download).saveAs(path)
  const zip = await new JSZip().loadAsync(await readFile(path))
  const xml = await zip.file('word/document.xml')!.async('text')
  expect(xml).toContain('FIRST SYNTHETIC DOCUMENT')
  expect(xml).toContain('SECOND SYNTHETIC DOCUMENT')
  await expect.poll(() => page.workers().length).toBe(0)
})
