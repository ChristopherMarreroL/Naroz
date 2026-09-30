import { expect, test } from 'bun:test'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { beginPdfPreview } from '../src/features/document/lib/pdfPreview'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function fixture() {
  const render = deferred<void>()
  const calls = { renders: 0, cleanups: 0, cancels: 0 }
  const canvas = { width: 0, height: 0, getContext: () => ({}) } as unknown as HTMLCanvasElement
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
    render: () => {
      calls.renders++
      return { promise: render.promise, cancel: () => { calls.cancels++ } }
    },
    cleanup: () => { calls.cleanups++; return true },
  } as unknown as PDFPageProxy
  const pdf = { getPage: async () => page } as unknown as PDFDocumentProxy
  return { render, calls, canvas, page, pdf }
}

test('successful preview releases PDF page resources while retaining the rendered canvas', async () => {
  const value = fixture()
  const preview = beginPdfPreview(value.pdf, 1, value.canvas, 1600, 2)
  value.render.resolve()
  expect(await preview.promise).toBe(.75)
  expect(value.canvas.width).toBe(1200)
  expect(value.canvas.height).toBe(1600)
  expect(value.calls).toMatchObject({ renders: 1, cleanups: 1 })
  preview.cancel()
  expect(value.canvas.width).toBe(0)
  expect(value.canvas.height).toBe(0)
  expect(value.calls.cleanups).toBe(1)
  expect(value.calls.cancels).toBe(0)
})

test('render failure clears canvas and releases the page; a subsequent attempt succeeds', async () => {
  const value = fixture()
  const preview = beginPdfPreview(value.pdf, 1, value.canvas, 1600, 2)
  value.render.reject(new Error('synthetic render failure'))
  await expect(preview.promise).rejects.toThrow('synthetic render failure')
  expect(value.canvas.width).toBe(0)
  expect(value.canvas.height).toBe(0)
  expect(value.calls.cleanups).toBe(1)
  const retry = fixture()
  const retried = beginPdfPreview(retry.pdf, 1, value.canvas, 1600, 2)
  retry.render.resolve()
  await retried.promise
  expect(value.canvas.width).toBeGreaterThan(0)
  expect(retry.calls.cleanups).toBe(1)
})

test('cancellation before getPage resolves cleans the late page without rendering or callbacks', async () => {
  const value = fixture()
  const loading = deferred<PDFPageProxy>()
  const pdf = { getPage: () => loading.promise } as unknown as PDFDocumentProxy
  const preview = beginPdfPreview(pdf, 1, value.canvas, 1600, 2)
  preview.cancel()
  loading.resolve(value.page)
  expect(await preview.promise).toBeNull()
  expect(value.calls).toMatchObject({ renders: 0, cleanups: 1 })
  expect(value.canvas.width).toBe(0)
  expect(value.canvas.height).toBe(0)
})

test('cancellation during rendering cancels the task and releases resources without a ready callback', async () => {
  const value = fixture()
  const preview = beginPdfPreview(value.pdf, 1, value.canvas, 1600, 2)
  await Promise.resolve()
  expect(value.calls.renders).toBe(1)
  preview.cancel()
  value.render.reject(new Error('synthetic render cancellation'))
  expect(await preview.promise).toBeNull()
  expect(value.calls).toMatchObject({ cancels: 1, cleanups: 1 })
  expect(value.canvas.width).toBe(0)
  expect(value.canvas.height).toBe(0)
})

test('viewport failure releases the page and leaves a retryable empty canvas', async () => {
  const value = fixture()
  value.page.getViewport = () => { throw new Error('synthetic viewport failure') }
  const preview = beginPdfPreview(value.pdf, 1, value.canvas, 1600, 2)
  await expect(preview.promise).rejects.toThrow('synthetic viewport failure')
  expect(value.calls).toMatchObject({ renders: 0, cleanups: 1 })
  expect(value.canvas.width).toBe(0)
  expect(value.canvas.height).toBe(0)
})

test('canvas allocation failure releases the page before a render task is created', async () => {
  const value = fixture()
  let width = 0
  Object.defineProperty(value.canvas, 'width', { get: () => width, set: (next: number) => {
    if (next > 0) throw new Error('synthetic canvas allocation failure')
    width = next
  } })
  const preview = beginPdfPreview(value.pdf, 1, value.canvas, 1600, 2)
  await expect(preview.promise).rejects.toThrow('synthetic canvas allocation failure')
  expect(value.calls).toMatchObject({ renders: 0, cleanups: 1 })
  expect(value.canvas.width).toBe(0)
  expect(value.canvas.height).toBe(0)
})

test('shared page cleanup cannot invalidate another in-flight preview', async () => {
  const first = fixture(), second = fixture()
  const tasks = [first.render, second.render]
  let started = 0, active = 0, released = 0
  first.page.render = (() => {
    const task = tasks[started++]
    active++
    return { promise: task.promise.finally(() => { active-- }), cancel: () => undefined }
  }) as PDFPageProxy['render']
  first.page.cleanup = () => {
    first.calls.cleanups++
    if (active) return false
    released++
    return true
  }
  const a = beginPdfPreview(first.pdf, 1, first.canvas, 1600, 2)
  const b = beginPdfPreview(first.pdf, 1, second.canvas, 160, 1)
  await Promise.resolve()
  first.render.resolve()
  expect(await a.promise).toBe(.75)
  expect(released).toBe(0)
  expect(second.canvas.width).toBe(120)
  second.render.resolve()
  expect(await b.promise).toBe(.75)
  expect(first.calls.cleanups).toBe(2)
  expect(released).toBe(1)
})

test('a stale cancelled attempt does not clear the canvas of a newer attempt', async () => {
  const old = fixture(), next = fixture()
  const first = beginPdfPreview(old.pdf, 1, old.canvas, 1600, 2)
  await Promise.resolve()
  first.cancel()
  const second = beginPdfPreview(next.pdf, 1, old.canvas, 1600, 2)
  await Promise.resolve()
  old.render.reject(new Error('synthetic stale cancellation'))
  await Promise.allSettled([first.promise])
  expect(old.canvas.width).toBe(1200)
  expect(old.canvas.height).toBe(1600)
  next.render.resolve()
  await second.promise
  expect(next.calls.cleanups).toBe(1)
})
