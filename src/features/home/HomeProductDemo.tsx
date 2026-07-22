import { useEffect, useRef, useState } from 'react'

import narozLogo from '../../assets/naroz-logo.jpg'
import { ToolIcon } from '../../components/shared/ToolIcon'
import type { AppToolId } from '../../types/app'

type DemoFlowId = 'image' | 'markdown' | 'qr'
type DemoPhase = 'home' | 'selecting' | 'empty' | 'picker' | 'pickerConfirm' | 'loaded' | 'processing' | 'complete' | 'downloading' | 'downloaded' | 'returning'
type LocalizedText = { es: string; en: string }

interface HomeProductDemoProps {
  locale: 'es' | 'en'
  onNavigate: (tool: AppToolId) => void
}

interface DemoFlow {
  id: DemoFlowId
  toolId: AppToolId
  path: string
  category: LocalizedText
  title: LocalizedText
  description: LocalizedText
  sourceName: string
  sourceMeta: string
  sourceFormat: string
  pickerFileName: string
  pickerFileMeta: LocalizedText
  outputName: string
  outputMeta: string
  outputFormat: string
}

interface DemoCatalogTool {
  toolId: AppToolId
  category: LocalizedText
  title: LocalizedText
  flowId?: DemoFlowId
}

const flows: DemoFlow[] = [
  {
    id: 'image',
    toolId: 'image-convert',
    path: '/image-convert',
    category: { es: 'Imagen', en: 'Image' },
    title: { es: 'Convertir imagen', en: 'Convert image' },
    description: { es: 'Cambia PNG, JPG y WebP directamente en tu navegador.', en: 'Change PNG, JPG, and WebP directly in your browser.' },
    sourceName: 'naroz-demo.png',
    sourceMeta: 'PNG · 2.4 MB',
    sourceFormat: 'PNG',
    pickerFileName: 'naroz-demo.png',
    pickerFileMeta: { es: 'Imagen PNG · 2.4 MB', en: 'PNG image · 2.4 MB' },
    outputName: 'naroz-demo.webp',
    outputMeta: 'WebP · 640 KB',
    outputFormat: 'WEBP',
  },
  {
    id: 'markdown',
    toolId: 'document-markdown-converter',
    path: '/markdown-converter',
    category: { es: 'Documento', en: 'Document' },
    title: { es: 'Markdown a PDF', en: 'Markdown to PDF' },
    description: { es: 'Convierte un README en PDF o Word con vista previa.', en: 'Turn a README into PDF or Word with a preview.' },
    sourceName: 'README.md',
    sourceMeta: 'Markdown · 18 KB',
    sourceFormat: 'MD',
    pickerFileName: 'README.md',
    pickerFileMeta: { es: 'Documento Markdown · 18 KB', en: 'Markdown document · 18 KB' },
    outputName: 'README.pdf',
    outputMeta: 'PDF · 92 KB',
    outputFormat: 'PDF',
  },
  {
    id: 'qr',
    toolId: 'utility-qr-generator',
    path: '/qr-generator',
    category: { es: 'Utilidad', en: 'Utility' },
    title: { es: 'Generador de código QR', en: 'QR code generator' },
    description: { es: 'Convierte enlaces o texto en un QR descargable.', en: 'Turn links or text into a downloadable QR code.' },
    sourceName: 'https://naroz.vercel.app',
    sourceMeta: 'Enlace seguro · HTTPS',
    sourceFormat: 'URL',
    pickerFileName: 'naroz-enlace.txt',
    pickerFileMeta: { es: 'Documento de texto · 1 KB', en: 'Text document · 1 KB' },
    outputName: 'naroz-qr.png',
    outputMeta: 'PNG · 48 KB',
    outputFormat: 'QR',
  },
]

const catalogTools: DemoCatalogTool[] = [
  { toolId: 'utility-qr-generator', category: { es: 'Utilidad', en: 'Utility' }, title: { es: 'Código QR', en: 'QR code' }, flowId: 'qr' },
  { toolId: 'document-merge-pdf', category: { es: 'Documento', en: 'Document' }, title: { es: 'Unir PDF', en: 'Merge PDF' } },
  { toolId: 'document-delete-pages', category: { es: 'Documento', en: 'Document' }, title: { es: 'Eliminar páginas', en: 'Delete pages' } },
  { toolId: 'document-merge-docx', category: { es: 'Documento', en: 'Document' }, title: { es: 'Unir Word', en: 'Merge Word' } },
  { toolId: 'document-markdown-converter', category: { es: 'Documento', en: 'Document' }, title: { es: 'Markdown a PDF', en: 'Markdown to PDF' }, flowId: 'markdown' },
  { toolId: 'document-msg-to-pdf', category: { es: 'Documento', en: 'Document' }, title: { es: 'Correo a PDF', en: 'Email to PDF' } },
  { toolId: 'document-pdf-to-office', category: { es: 'Documento', en: 'Document' }, title: { es: 'PDF a Office', en: 'PDF to Office' } },
  { toolId: 'document-office-to-pdf', category: { es: 'Documento', en: 'Document' }, title: { es: 'Office a PDF', en: 'Office to PDF' } },
  { toolId: 'document-excel-column-builder', category: { es: 'Excel', en: 'Excel' }, title: { es: 'Elegir columnas', en: 'Select columns' } },
  { toolId: 'document-excel-join', category: { es: 'Excel', en: 'Excel' }, title: { es: 'Cruzar Excel', en: 'Join Excel' } },
  { toolId: 'image-convert', category: { es: 'Imagen', en: 'Image' }, title: { es: 'Convertir imagen', en: 'Convert image' }, flowId: 'image' },
  { toolId: 'image-remove-background', category: { es: 'Imagen', en: 'Image' }, title: { es: 'Quitar fondo', en: 'Remove background' } },
  { toolId: 'image-crop', category: { es: 'Imagen', en: 'Image' }, title: { es: 'Recortar imagen', en: 'Crop image' } },
  { toolId: 'image-transform', category: { es: 'Imagen', en: 'Image' }, title: { es: 'Rotar imagen', en: 'Rotate image' } },
  { toolId: 'video-merge', category: { es: 'Video', en: 'Video' }, title: { es: 'Unir videos', en: 'Merge videos' } },
  { toolId: 'video-convert', category: { es: 'Video', en: 'Video' }, title: { es: 'Convertir video', en: 'Convert video' } },
  { toolId: 'video-extract-audio', category: { es: 'Video', en: 'Video' }, title: { es: 'Extraer audio', en: 'Extract audio' } },
  { toolId: 'video-remove-audio', category: { es: 'Video', en: 'Video' }, title: { es: 'Quitar audio', en: 'Remove audio' } },
  { toolId: 'video-resize', category: { es: 'Video', en: 'Video' }, title: { es: 'Cambiar resolución', en: 'Resize video' } },
  { toolId: 'video-speed', category: { es: 'Video', en: 'Video' }, title: { es: 'Cambiar velocidad', en: 'Change speed' } },
  { toolId: 'video-trim', category: { es: 'Video', en: 'Video' }, title: { es: 'Recortar video', en: 'Trim video' } },
]

const automaticFlowOrder: DemoFlowId[] = ['qr', 'image', 'markdown']
const phases: DemoPhase[] = ['home', 'selecting', 'empty', 'picker', 'pickerConfirm', 'loaded', 'processing', 'complete', 'downloading', 'downloaded', 'returning']
const phaseDurations: Record<DemoPhase, number> = {
  home: 900,
  selecting: 1450,
  empty: 1350,
  picker: 1350,
  pickerConfirm: 1250,
  loaded: 1450,
  processing: 1000,
  complete: 1500,
  downloading: 950,
  downloaded: 1250,
  returning: 1300,
}

const clickingPhases: DemoPhase[] = ['selecting', 'empty', 'picker', 'pickerConfirm', 'loaded', 'complete', 'returning']

export function HomeProductDemo({ locale, onNavigate }: HomeProductDemoProps) {
  const [activeFlowId, setActiveFlowId] = useState<DemoFlowId>('qr')
  const [phase, setPhase] = useState<DemoPhase>('home')
  const [isAutoPlaying, setIsAutoPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const manualTimerRef = useRef<number | null>(null)
  const activeFlow = flows.find((flow) => flow.id === activeFlowId) ?? flows[0]

  useEffect(() => {
    if (!isAutoPlaying) {
      return
    }

    const timer = window.setTimeout(() => {
      const phaseIndex = phases.indexOf(phase)
      if (phaseIndex < phases.length - 1) {
        setPhase(phases[phaseIndex + 1])
        return
      }

      const flowIndex = automaticFlowOrder.indexOf(activeFlowId)
      setActiveFlowId(automaticFlowOrder[(flowIndex + 1) % automaticFlowOrder.length])
      setPhase('home')
    }, phaseDurations[phase])

    return () => window.clearTimeout(timer)
  }, [activeFlowId, isAutoPlaying, phase])

  useEffect(() => {
    const root = rootRef.current
    if (!root || !isAutoPlaying) {
      return
    }

    const updateCursor = () => {
      const selector = phase === 'home'
        ? '[data-demo-target="catalog-heading"]'
        : phase === 'selecting'
          ? '[data-demo-flow-target="' + activeFlowId + '"]'
          : phase === 'empty'
            ? '[data-demo-target="upload-plus"]'
            : phase === 'picker'
              ? '[data-demo-target="picker-file"]'
              : phase === 'pickerConfirm'
                ? '[data-demo-target="picker-confirm"]'
                : phase === 'loaded' || phase === 'complete'
                  ? '[data-demo-target="action"]'
                  : phase === 'processing'
                    ? '[data-demo-target="result"]'
                    : phase === 'downloading' || phase === 'downloaded'
                      ? '[data-demo-target="download-indicator"]'
                      : '[data-demo-target="back"]'
      const target = root.querySelector<HTMLElement>(selector)
      if (!target) {
        return
      }

      const rootRect = root.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      const targetRatio = phase === 'empty' ? 0.76 : 0.58
      root.style.setProperty('--demo-cursor-x', String(targetRect.left - rootRect.left + targetRect.width * targetRatio) + 'px')
      root.style.setProperty('--demo-cursor-y', String(targetRect.top - rootRect.top + targetRect.height * targetRatio) + 'px')
    }

    const frame = window.requestAnimationFrame(updateCursor)
    window.addEventListener('resize', updateCursor)

    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', updateCursor)
    }
  }, [activeFlowId, isAutoPlaying, phase])

  useEffect(() => () => {
    if (manualTimerRef.current) {
      window.clearTimeout(manualTimerRef.current)
    }
  }, [])

  const clearManualTimer = () => {
    if (manualTimerRef.current) {
      window.clearTimeout(manualTimerRef.current)
      manualTimerRef.current = null
    }
  }

  const pauseDemo = () => {
    if (!isAutoPlaying) {
      return
    }

    setIsAutoPlaying(false)
    if (phase === 'processing') {
      setPhase('loaded')
    }
  }

  const selectFlow = (flowId: DemoFlowId) => {
    clearManualTimer()
    setActiveFlowId(flowId)
    setPhase('empty')
  }

  const returnHome = () => {
    clearManualTimer()
    setPhase('home')
  }

  const handleCatalogTool = (tool: DemoCatalogTool) => {
    if (tool.flowId) {
      selectFlow(tool.flowId)
      return
    }

    onNavigate(tool.toolId)
  }

  const handlePrimaryAction = () => {
    pauseDemo()

    if (phase === 'empty') {
      setPhase('picker')
      return
    }
    if (phase === 'loaded') {
      clearManualTimer()
      setPhase('processing')
      manualTimerRef.current = window.setTimeout(() => {
        setPhase('complete')
        manualTimerRef.current = null
      }, 850)
      return
    }
    if (phase === 'complete') {
      clearManualTimer()
      setPhase('downloading')
      manualTimerRef.current = window.setTimeout(() => {
        setPhase('downloaded')
        manualTimerRef.current = null
      }, 700)
      return
    }
    if (phase === 'downloaded') {
      onNavigate(activeFlow.toolId)
    }
  }

  const openPicker = () => {
    clearManualTimer()
    pauseDemo()
    setPhase('picker')
  }

  const selectPickerFile = () => {
    pauseDemo()
    setPhase('pickerConfirm')
  }

  const confirmPickerFile = () => {
    pauseDemo()
    setPhase('loaded')
  }

  const resumeDemo = () => {
    clearManualTimer()
    setActiveFlowId('qr')
    setPhase('home')
    setIsAutoPlaying(true)
  }

  const text = {
    automatic: locale === 'es' ? 'Demo automática' : 'Automatic demo',
    manual: locale === 'es' ? 'Reanudar demo' : 'Resume demo',
    available: locale === 'es' ? 'Herramientas disponibles' : 'Available tools',
    availableDescription: locale === 'es' ? 'Elige una herramienta para transformar tu archivo.' : 'Choose a tool to transform your file.',
    startHere: locale === 'es' ? 'Empieza aquí' : 'Start here',
    backHome: locale === 'es' ? 'Volver al inicio' : 'Back to home',
    loadExample: locale === 'es' ? 'Cargar ejemplo' : 'Load example',
    convert: locale === 'es' ? 'Convertir' : 'Convert',
    processing: locale === 'es' ? 'Convirtiendo...' : 'Converting...',
    openRealTool: locale === 'es' ? 'Abrir herramienta real' : 'Open real tool',
    downloadResult: locale === 'es' ? 'Descargar resultado' : 'Download result',
    downloadingFile: locale === 'es' ? 'Descargando archivo...' : 'Downloading file...',
    downloadComplete: locale === 'es' ? 'Descarga completada' : 'Download complete',
    dropHint: locale === 'es' ? 'Arrastra un archivo o carga el ejemplo' : 'Drop a file or load the example',
    output: locale === 'es' ? 'Resultado' : 'Result',
    local: '100% local',
    privacy: locale === 'es' ? 'Nada sale de tu navegador' : 'Nothing leaves your browser',
    reload: locale === 'es' ? 'Reiniciar demostración' : 'Restart demo',
    filePicker: locale === 'es' ? 'Seleccionar archivo' : 'Select file',
    thisDevice: locale === 'es' ? 'Este equipo' : 'This device',
    recent: locale === 'es' ? 'Recientes' : 'Recent',
    downloads: locale === 'es' ? 'Descargas' : 'Downloads',
    desktop: locale === 'es' ? 'Escritorio' : 'Desktop',
    cancel: locale === 'es' ? 'Cancelar' : 'Cancel',
    choose: locale === 'es' ? 'Seleccionar' : 'Choose',
  }

  const isHome = phase === 'home' || phase === 'selecting'
  const displayedPath = isHome ? '/' : activeFlow.path

  return (
    <div
      ref={rootRef}
      className="conversion-bench home-product-demo home-product-demo-full"
      data-demo-flow={activeFlow.id}
      data-demo-phase={phase}
      data-demo-clicking={clickingPhases.includes(phase)}
      onClickCapture={pauseDemo}
      onFocusCapture={pauseDemo}
      onTouchStartCapture={pauseDemo}
    >
      <div className="bench-windowbar">
        <div className="demo-window-controls">
          <span className="bench-dots" aria-hidden="true"><i /><i /><i /></span>
          <span className="demo-window-mark" aria-hidden="true">
            <svg viewBox="0 0 20 20"><rect x="3.5" y="4" width="13" height="12" rx="2" /><path d="M8 4v12" /></svg>
          </span>
          <button type="button" onClick={returnHome} disabled={isHome} aria-label={text.backHome}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 5-5 5 5 5" /></svg>
          </button>
          <button type="button" onClick={() => selectFlow(activeFlowId)} disabled={!isHome} aria-label={activeFlow.title[locale]}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 5 5 5-5 5" /></svg>
          </button>
        </div>

        <div className="demo-address-pill">
          <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="8" width="10" height="8" rx="2" /><path d="M7.5 8V6.5a2.5 2.5 0 0 1 5 0V8" /></svg>
          <span className="demo-address">https://naroz.vercel.app{displayedPath}</span>
          <button type="button" onClick={resumeDemo} aria-label={text.reload}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M15 7V3m0 0h-4m4 0-2.4 2.4a6 6 0 1 0 1.1 8.1" /></svg>
          </button>
        </div>

        <button
          type="button"
          className={isAutoPlaying ? 'demo-playback demo-playback-active' : 'demo-playback'}
          onClick={isAutoPlaying ? pauseDemo : resumeDemo}
        >
          <i aria-hidden="true" />
          {isAutoPlaying ? text.automatic : text.manual}
        </button>
      </div>

      <div className="demo-app-topbar">
        <button type="button" className="demo-brand-button" onClick={returnHome} aria-label={text.backHome}>
          <img src={narozLogo} alt="" />
          <strong>Naroz</strong>
        </button>
        <span className="demo-topbar-label">{isHome ? (locale === 'es' ? 'Inicio' : 'Home') : activeFlow.category[locale]}</span>
        <span className="demo-language">{locale.toUpperCase()}</span>
      </div>

      <div className="demo-app-viewport">
        {isHome ? (
          <section className="demo-sim-tools">
            <div className="demo-catalog-heading" data-demo-target="catalog-heading">
              <span>{text.startHere}</span>
              <h2>{text.available}</h2>
              <p>{text.availableDescription}</p>
            </div>

            <div className="demo-home-tool-grid">
              {catalogTools.map((tool) => (
                <button
                  key={tool.toolId}
                  type="button"
                  className={tool.flowId === activeFlow.id ? 'demo-home-tool-target' : ''}
                  data-demo-flow-target={tool.flowId}
                  data-category={tool.category.en.toLowerCase()}
                  onClick={() => handleCatalogTool(tool)}
                >
                  <span className="demo-home-tool-icon"><ToolIcon toolId={tool.toolId} className="h-5 w-5" /></span>
                  <span>
                    <small>{tool.category[locale]}</small>
                    <strong>{tool.title[locale]}</strong>
                  </span>
                  <em aria-hidden="true">↗</em>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className="demo-sim-tool">
            <header className="demo-tool-page-heading">
              <button type="button" data-demo-target="back" onClick={returnHome} aria-label={text.backHome}>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m12.5 5-5 5 5 5" /></svg>
              </button>
              <span className="demo-tool-icon"><ToolIcon toolId={activeFlow.toolId} className="h-5 w-5" /></span>
              <span>
                <small>{activeFlow.category[locale]} · {text.local}</small>
                <strong>{activeFlow.title[locale]}</strong>
                <em>{activeFlow.description[locale]}</em>
              </span>
              <span className="demo-local-pill">Local</span>
            </header>

            <section className="demo-sim-tool-form">
              <div className="demo-form-heading">
                <span>
                  <strong>{activeFlow.sourceFormat} → {activeFlow.outputFormat}</strong>
                  <small>{text.privacy}</small>
                </span>
                <span className="demo-local-pill">{activeFlow.outputFormat}</span>
              </div>

              <button
                type="button"
                className={phase === 'empty' ? 'demo-input-card' : 'demo-input-card demo-input-loaded'}
                data-demo-target="upload"
                onClick={openPicker}
              >
                {phase === 'empty' ? (
                  <>
                    <span className="demo-upload-plus" data-demo-target="upload-plus">+</span>
                    <strong>{text.dropHint}</strong>
                    <small>{activeFlow.sourceFormat}</small>
                  </>
                ) : (
                  <>
                    <span className="demo-file-icon"><ToolIcon toolId={activeFlow.toolId} className="h-5 w-5" /></span>
                    <span className="demo-file-copy"><strong>{activeFlow.sourceName}</strong><small>{activeFlow.sourceMeta}</small></span>
                    <span className="demo-format-badge">{activeFlow.sourceFormat}</span>
                  </>
                )}
              </button>

              <div className="demo-action-row">
                <span className="demo-output-choice">{locale === 'es' ? 'Salida' : 'Output'} <strong>{activeFlow.outputFormat}</strong></span>
                <button type="button" data-demo-target="action" disabled={phase === 'processing' || phase === 'downloading'} onClick={handlePrimaryAction}>
                  {phase === 'empty' ? text.loadExample : phase === 'loaded' ? text.convert : phase === 'processing' ? text.processing : phase === 'complete' ? text.downloadResult : phase === 'downloading' ? text.downloadingFile : text.openRealTool}
                </button>
              </div>

              <div
                className={phase === 'processing' ? 'demo-result-card demo-result-processing' : phase === 'complete' || phase === 'downloading' || phase === 'downloaded' || phase === 'returning' ? 'demo-result-card demo-result-ready' : 'demo-result-card'}
                data-demo-target="result"
              >
                <span className="demo-result-check">{phase === 'processing' ? '' : '✓'}</span>
                <span className="demo-file-copy">
                  <strong>{phase === 'processing' ? text.processing : activeFlow.outputName}</strong>
                  <small>{phase === 'processing' ? (locale === 'es' ? 'Procesamiento local' : 'Local processing') : activeFlow.outputMeta}</small>
                </span>
                <span className="demo-ready-label">{phase === 'complete' || phase === 'downloading' || phase === 'downloaded' || phase === 'returning' ? (locale === 'es' ? 'Listo' : 'Ready') : text.output}</span>
              </div>
            </section>
          </div>
        )}

        {phase === 'picker' || phase === 'pickerConfirm' ? (
          <div className="demo-file-picker-backdrop">
            <section className="demo-file-picker" aria-label={text.filePicker}>
              <header>
                <span className="demo-picker-app-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24"><path d="M3.5 7.5h6l1.8 2H20.5v8.8a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2Z" /><path d="M3.5 7.5V5.7a2.2 2.2 0 0 1 2.2-2.2h3.4l1.8 2h7.4a2.2 2.2 0 0 1 2.2 2.2v1.8" /></svg>
                </span>
                <strong>{text.filePicker}</strong>
                <span className="demo-picker-window-actions" aria-hidden="true"><i /><i /><i /></span>
              </header>

              <div className="demo-file-picker-body">
                <aside>
                  <strong>{text.thisDevice}</strong>
                  <span>{text.recent}</span>
                  <span className="demo-picker-location-active">{text.downloads}</span>
                  <span>{text.desktop}</span>
                </aside>
                <div className="demo-file-picker-content">
                  <div className="demo-file-picker-path">
                    <span>{text.thisDevice}</span><i>›</i><strong>{text.downloads}</strong>
                  </div>
                  <button
                    type="button"
                    className={phase === 'pickerConfirm' ? 'demo-picker-file demo-picker-file-selected' : 'demo-picker-file'}
                    data-demo-target="picker-file"
                    onClick={selectPickerFile}
                  >
                    <span className="demo-picker-file-icon"><ToolIcon toolId={activeFlow.toolId} className="h-5 w-5" /></span>
                    <span><strong>{activeFlow.pickerFileName}</strong><small>{activeFlow.pickerFileMeta[locale]}</small></span>
                    <i aria-hidden="true">✓</i>
                  </button>
                </div>
              </div>

              <footer>
                <button type="button" onClick={() => setPhase('empty')}>{text.cancel}</button>
                <button
                  type="button"
                  className="demo-picker-confirm"
                  data-demo-target="picker-confirm"
                  disabled={phase === 'picker'}
                  onClick={confirmPickerFile}
                >
                  {text.choose}
                </button>
              </footer>
            </section>
          </div>
        ) : null}

        {phase === 'downloading' || phase === 'downloaded' ? (
          <div className={phase === 'downloaded' ? 'demo-download-popover demo-download-complete' : 'demo-download-popover'} data-demo-target="download-indicator">
            <span className="demo-download-icon" aria-hidden="true">
              {phase === 'downloaded' ? '✓' : <svg viewBox="0 0 20 20"><path d="M10 3v9m0 0 3.5-3.5M10 12 6.5 8.5M4 16h12" /></svg>}
            </span>
            <span className="demo-download-copy">
              <strong>{activeFlow.outputName}</strong>
              <small>{phase === 'downloaded' ? text.downloadComplete : text.downloadingFile}</small>
            </span>
            <span className="demo-download-status">{phase === 'downloaded' ? '100%' : '68%'}</span>
            <i aria-hidden="true" />
          </div>
        ) : null}
      </div>

      {isAutoPlaying ? (
        <span key={phase} className="demo-cursor demo-full-cursor" aria-hidden="true">
          <svg viewBox="0 0 32 32"><path d="M5 3 26 17l-9 2 5 8-4 2-5-8-6 7Z" /></svg>
          <i />
        </span>
      ) : null}

      <div className="bench-footer">
        <span className="bench-shield" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.8"><path d="M12 3 5.5 6v5.5c0 4.2 2.6 7.2 6.5 9.5 3.9-2.3 6.5-5.3 6.5-9.5V6Z" /><path d="m9 12 2 2 4-4" /></svg>
        </span>
        <span><strong>{text.local}</strong>{text.privacy}</span>
        <span className="demo-flow-dots" aria-hidden="true">
          {automaticFlowOrder.map((flowId) => <i key={flowId} className={activeFlow.id === flowId ? 'demo-flow-dot-active' : ''} />)}
        </span>
      </div>
    </div>
  )
}
