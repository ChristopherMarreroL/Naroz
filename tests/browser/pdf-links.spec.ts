import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/browser/harness.html')
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true')
})

for (const mode of ['merge', 'selection'] as const) {
  test(`${mode} keeps safe clickable links aligned through rotation, crop and UserUnit`, async ({ page }) => {
    const result = await page.evaluate(async (mode) => {
      const adapterPath = '/src/lib/fileCompatibility/pdf.ts'
      const runtimePath = '/src/lib/fileCompatibility/pdfRuntime.ts'
      const helperPath = '/tests/browser/helpers.ts'
      const { openPdfForEditing, validatePdfOutput } = await import(adapterPath)
      const { createPdfLoadingTask } = await import(runtimePath)
      const { PDFDocument } = await import(helperPath)
      const fixture = async (name: string) => (await fetch(`/tests/fixtures/links/${name}-links.pdf`)).arrayBuffer()
      const output = await PDFDocument.create()
      const budget = { pixels: 0, bytes: 0 }
      const indices = mode === 'merge' ? [0, 1, 2, 3] : [3, 1, 0]
      if (mode === 'merge') {
        const normal = await openPdfForEditing(await fixture('normal'))
        try { await normal.appendTo(output, [0], budget) } finally { await normal.dispose() }
      }
      const source = await openPdfForEditing(await fixture('protected'))
      try { await source.appendTo(output, indices, budget) } finally { await source.dispose() }
      const bytes = await output.save()
      await validatePdfOutput(bytes, indices.length + (mode === 'merge' ? 1 : 0), indices.map((_, offset) => offset + (mode === 'merge' ? 2 : 1)))
      const task = createPdfLoadingTask(bytes)
      const originalTask = createPdfLoadingTask(await fixture('protected'))
      try {
        const pdf = await task.promise
        const original = await originalTask.promise
        const pages = []
        for (const [offset, index] of indices.entries()) {
          const inputPage = await original.getPage(index + 1)
          const outputPage = await pdf.getPage(offset + (mode === 'merge' ? 2 : 1))
          try {
            const originalViewport = inputPage.getViewport({ scale: 1 })
            const viewport = outputPage.getViewport({ scale: 1 })
            const annotations = await outputPage.getAnnotations()
            const explicit = annotations.find((annotation: { url?: string }) => annotation.url === `https://example.org/explicit-${index + 1}`)
            const textLink = annotations.find((annotation: { url?: string }) => annotation.url === `https://example.org/page-${index + 1}`)
            const point = (transform: number[], x: number, y: number) => [transform[0] * x + transform[2] * y + transform[4], transform[1] * x + transform[3] * y + transform[5]]
            const rectangle = (transform: number[], rect: number[]) => [...point(transform, rect[0], rect[1]), ...point(transform, rect[2], rect[3])]
            const expected = rectangle(originalViewport.transform, [50, 417, 220, 435])
            const actual = explicit ? rectangle(viewport.transform, explicit.rect) : []
            const normalize = (rect: number[]) => [Math.min(rect[0], rect[2]), Math.min(rect[1], rect[3]), Math.max(rect[0], rect[2]), Math.max(rect[1], rect[3])]
            const content = await inputPage.getTextContent()
            const item = content.items.find((item: { str?: string }) => item.str === `https://example.org/page-${index + 1}`)
            const center = point(originalViewport.transform, item.transform[4] + item.width / 2, item.transform[5] + item.height / 3)
            const textRect = textLink ? normalize(rectangle(viewport.transform, textLink.rect)) : []
            pages.push({
              urls: annotations.map((annotation: { url?: string; unsafeUrl?: string }) => annotation.url ?? annotation.unsafeUrl ?? ''),
              expected: normalize(expected), actual: normalize(actual),
              textContainsCenter: textRect.length === 4 && center[0] >= textRect[0] && center[0] <= textRect[2] && center[1] >= textRect[1] && center[1] <= textRect[3],
              dimensions: [viewport.width, viewport.height], expectedDimensions: [originalViewport.width, originalViewport.height],
            })
          } finally { inputPage.cleanup(); outputPage.cleanup() }
        }
        let normalTextItems = 0
        if (mode === 'merge') {
          const normal = await pdf.getPage(1)
          try { normalTextItems = (await normal.getTextContent()).items.length } finally { normal.cleanup() }
        }
        return { pages, indices, normalTextItems }
      } finally { await task.destroy(); await originalTask.destroy() }
    }, mode)
    result.pages.forEach((page, offset) => {
      expect(page.urls).toContain(`https://example.org/page-${result.indices[offset] + 1}`)
      expect(page.urls).toContain(`https://example.org/explicit-${result.indices[offset] + 1}`)
      expect(page.urls.some((url: string) => /^https?:\/\/www\.example\.org\/account$/.test(url))).toBe(true)
      expect(page.urls.every((url: string) => /^https?:\/\//.test(url))).toBe(true)
      expect(page.dimensions).toEqual(page.expectedDimensions)
      page.actual.forEach((coordinate: number, axis: number) => expect(coordinate).toBeCloseTo(page.expected[axis], 2))
      expect(page.textContainsCenter).toBe(true)
    })
    if (mode === 'merge') expect(result.normalTextItems).toBeGreaterThan(0)
    await expect.poll(() => page.workers().length).toBe(0)
  })
}
