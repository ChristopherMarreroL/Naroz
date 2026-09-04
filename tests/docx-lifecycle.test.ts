import { expect, test } from 'bun:test'
import { Document, Packer, Paragraph } from 'docx'
import { JSDOM } from 'jsdom'
import { act, createElement, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { LocaleProvider } from '../src/i18n/LocaleProvider'
import { useDocxMerger } from '../src/features/document/hooks/useDocxMerger'

test('DOCX hook settles worker errors/timeouts, retries, cancels, and releases on unmount', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://naroz.test' })
  dom.window.localStorage.setItem('naroz-locale-preference-v2', 'es')
  const saved = new Map<string, PropertyDescriptor | undefined>()
  function replace(name: string, value: unknown) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
  const instances: FakeWorker[] = []
  const revokedUrls: string[] = []
  const originalRevoke = URL.revokeObjectURL
  URL.revokeObjectURL = (url: string) => { revokedUrls.push(url); originalRevoke(url) }
  let timeout: (() => void) | undefined
  let cleared = 0
  class FakeWorker {
    onerror: (() => void) | null = null
    onmessage: ((event: { data: { buffer: ArrayBuffer } }) => void) | null = null
    terminated = false
    posted = false
    constructor() { instances.push(this) }
    postMessage() { this.posted = true }
    terminate() { this.terminated = true }
  }
  replace('window', dom.window)
  replace('document', dom.window.document)
  replace('navigator', dom.window.navigator)
  replace('Worker', FakeWorker)
  replace('IS_REACT_ACT_ENVIRONMENT', true)
  dom.window.setTimeout = ((callback: () => void) => { timeout = callback; return 1 }) as typeof dom.window.setTimeout
  dom.window.clearTimeout = () => { timeout = undefined; cleared += 1 }
  const root = createRoot(dom.window.document.getElementById('root')!)
  let current: ReturnType<typeof useDocxMerger> | undefined
  function Probe() {
    const value = useDocxMerger()
    return createElement(Capture, { value })
  }
  function Capture({ value }: { value: ReturnType<typeof useDocxMerger> }) {
    useEffect(() => { current = value }, [value])
    return null
  }
  const bytes = Uint8Array.from(await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph('Synthetic lifecycle')] }] }))).buffer
  const files = [new File([bytes], 'synthetic.docx'), new File([bytes], 'synthetic2.docx')]
  async function start() {
    const count = instances.length
    let operation: Promise<unknown> | undefined
    await act(async () => {
      operation = current!.mergeDocxFiles(files)
      for (let index = 0; instances.length === count && index < 200; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
    })
    expect(instances.length).toBe(count + 1)
    expect(current!.isProcessing).toBe(true)
    return { operation: operation!, worker: instances.at(-1)! }
  }
  let unmounted = false
  try {
    await act(async () => { root.render(createElement(LocaleProvider, null, createElement(Probe))) })
    const failed = await start()
    await act(async () => { failed.worker.onerror!(); await failed.operation })
    expect(failed.worker.terminated).toBe(true)
    expect(current!.isProcessing).toBe(false)
    expect(current!.progress.stage).toBe('error')
    expect(timeout).toBeUndefined()

    const timedOut = await start()
    await act(async () => { timeout!(); await timedOut.operation })
    expect(timedOut.worker.terminated).toBe(true)
    expect(current!.isProcessing).toBe(false)
    expect(current!.result).toBeNull()

    const cancelled = await start()
    await act(async () => { current!.resetMergeState(); await cancelled.operation })
    expect(cancelled.worker.terminated).toBe(true)
    expect(current!.progress.stage).toBe('idle')
    expect(current!.isProcessing).toBe(false)
    expect(current!.error).toBeNull()

    const corruptOutput = await start()
    await act(async () => {
      corruptOutput.worker.onmessage!({ data: { buffer: new TextEncoder().encode('invalid output').buffer } })
      await corruptOutput.operation
    })
    expect(current!.result).toBeNull()
    expect(current!.isProcessing).toBe(false)
    expect(current!.progress.stage).toBe('error')

    const successful = await start()
    await act(async () => {
      successful.worker.onmessage!({ data: { buffer: bytes } })
      await successful.operation
    })
    const url = current!.result!.url
    expect(current!.progress.stage).toBe('finished')
    expect(current!.isProcessing).toBe(false)
    expect(successful.worker.terminated).toBe(true)
    await act(async () => { current!.resetMergeState() })
    expect(revokedUrls).toContain(url)

    const active = await start()
    await act(async () => { root.unmount(); unmounted = true; await active.operation })
    expect(active.worker.terminated).toBe(true)
    expect(timeout).toBeUndefined()
    expect(cleared).toBe(6)
  } finally {
    if (!unmounted) await act(async () => root.unmount())
    dom.window.close()
    URL.revokeObjectURL = originalRevoke
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else Reflect.deleteProperty(globalThis, name)
    }
  }
})
