import { createElement, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { LocaleProvider } from '../../src/i18n/LocaleProvider'
import { usePdfMerger } from '../../src/features/document/hooks/usePdfMerger'

export async function mountPdfMergerHarness() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  let current: ReturnType<typeof usePdfMerger>
  let ready: () => void = () => undefined
  const mounted = new Promise<void>((resolve) => { ready = resolve })
  function Harness() {
    const merger = usePdfMerger()
    useEffect(() => { current = merger; ready() }, [merger])
    return null
  }
  root.render(createElement(LocaleProvider, null, createElement(Harness)))
  await mounted
  return { get: () => current, unmount: () => { root.unmount(); host.remove() } }
}
