import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { useBlocker } from 'react-router-dom'
import { PDFDocument } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useLocale } from '../../i18n/LocaleProvider'
import { SectionHero } from '../../components/shared/SectionHero'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { createPdfLoadingTask } from '../../lib/fileCompatibility/pdfRuntime'
import { validatePdfOutput } from '../../lib/fileCompatibility/pdf'
import { downloadFromUrl } from '../../lib/download'
import { assertPdfEditorResources, cropImage, exportEditedPdf, imageToPng, PDF_EDITOR_LOADING_LIMITS, PdfExportLimitError, PdfInputLimitError, textLayout, type PdfOverlay } from './lib/pdfEditor'
import { appendHistory, fitOverlay, imageBudget, resizeOverlay, resizeOverlayByFactor, sameElements, snapOverlay, type AlignmentGuides, type ResizeCorner } from './lib/pdfEditorState'
import { availablePdfFonts, canQueryPdfFonts, pdfFontFamily, queryPdfFonts } from './lib/pdfFonts'
import { PdfEditorIcon } from './PdfEditorIcon'
import { PdfPageThumbnails } from './PdfPageThumbnails'
import { PdfTextPreview } from './PdfTextPreview'
import { beginPdfPreview } from './lib/pdfPreview'
import './pdfEditor.css'

type Session = { pdf: PDFDocumentProxy; bytes: Uint8Array; name: string }
type InlineText = PdfOverlay & { value: string; isNew: boolean }
type ElementMenu = { id: string; x: number; y: number }
type History = { entries: PdfOverlay[][]; index: number }
type TextStyle = Pick<PdfOverlay, 'textColor' | 'textFont' | 'textBold' | 'textItalic' | 'textAlign'>
type Crop = { id: string; x: number; y: number; width: number; height: number }

function PageCanvas({ pdf, page, onReady, onError }: { pdf: PDFDocumentProxy; page: number; onReady: (ratio: number) => void; onError: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let active = true
    const canvas = ref.current!
    const preview = beginPdfPreview(pdf, page, canvas, 3000, 3)
    void preview.promise.then((ratio) => {
      if (active && ratio !== null) onReady(ratio)
    }).catch(() => { if (active) onError() })
    return () => { active = false; preview.cancel() }
  }, [pdf, page, onReady, onError])
  return <canvas ref={ref} className="pdf-editor-canvas" />
}

export function PdfEditView() {
  const { t } = useLocale()
  const [file, setFile] = useState<File | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingImages, setPendingImages] = useState(0)
  const pendingRef = useRef(0)
  const historyRef = useRef<History>({ entries: [[]], index: 0 })
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [ratio, setRatio] = useState(0)
  const [zoom, setZoom] = useState('100')
  const [paperWidth, setPaperWidth] = useState(900)
  const [thumbnails, setThumbnails] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [guides, setGuides] = useState<AlignmentGuides>({})
  const [crop, setCrop] = useState<Crop | null>(null)
  const cropGesture = useRef<{ x: number; y: number } | null>(null)
  const [savedItems, setSavedItems] = useState<PdfOverlay[]>([])
  const [downloaded, setDownloaded] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [history, setHistory] = useState<History>({ entries: [[]], index: 0 })
  const [textTool, setTextTool] = useState(false)
  const [inline, setInline] = useState<InlineText | null>(null)
  const inlineRef = useRef<InlineText | null>(null)
  const inlineInput = useRef<HTMLTextAreaElement>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const [menu, setMenu] = useState<ElementMenu | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [color, setColor] = useState('#111827')
  const [fonts, setFonts] = useState(availablePdfFonts)
  const [font, setFont] = useState(() => fonts.includes('Arial') ? 'Arial' : 'sans-serif')
  const [textStyle, setTextStyle] = useState<TextStyle>({ textBold: false, textItalic: false, textAlign: 'left' })
  const [fontLoading, setFontLoading] = useState(false)
  const [fontNotice, setFontNotice] = useState('')
  const fontRequest = useRef(0)
  useEffect(() => () => { fontRequest.current++ }, [])
  const workspace = useRef<HTMLDivElement>(null)
  const paper = useRef<HTMLDivElement>(null)
  const gesture = useRef<{ startX: number; startY: number; item: PdfOverlay; resize: ResizeCorner | 'rotate' | false; before: PdfOverlay[] } | null>(null)
  const rotationDragged = useRef(false)
  const [draft, setDraft] = useState<PdfOverlay[] | null>(null)
  const draftRef = useRef<PdfOverlay[] | null>(null)
  historyRef.current = history
  const busy = saving || pendingImages > 0
  const items = draft ?? history.entries[history.index]
  const current = items.find((item) => item.id === selected)
  const activeText = inline ?? (current?.text !== undefined ? current : textStyle)
  const pendingText = !!inline && (inline.isNew ? !!inline.value.trim() : inline.value !== inline.text || inline.textColor !== current?.textColor || inline.textFont !== current?.textFont || inline.textBold !== current?.textBold || inline.textItalic !== current?.textItalic || inline.textAlign !== current?.textAlign)
  const dirty = !!session && (!sameElements(items, savedItems) || pendingText || !!crop || pendingImages > 0)
  const blocker = useBlocker(dirty || saving)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    if (window.confirm(t('pdfEditLeave'))) blocker.proceed()
    else blocker.reset()
  }, [blocker, t])
  useEffect(() => {
    if (!dirty && !saving) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, saving])
  useEffect(() => {
    const changed = () => { setFullscreen(document.fullscreenElement === workspace.current); setError((error) => error === 'pdfEditFullscreenError' ? '' : error) }
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])
  useEffect(() => {
    if (!session) return
    const scroller = workspace.current?.querySelector('.pdf-editor-scroll')
    if (!scroller) return
    const observer = new ResizeObserver(() => {
      const style = getComputedStyle(scroller)
      const available = Math.max(40, scroller.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight))
      const height = Math.max(40, scroller.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom))
      setPaperWidth(zoom === 'page' ? Math.min(available, height * (ratio || 1)) : zoom === 'width' ? available : Math.min(available, 900) * Number(zoom) / 100)
    })
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [session, zoom, ratio, thumbnails, fullscreen])
  const commit = (next: PdfOverlay[]) => {
    if (!imageBudget(next)) { setError('pdfEditResourceLimit'); return false }
    draftRef.current = null; setDraft(null)
    setHistory((state) => appendHistory(state, next))
    setDownloaded(false)
    setError((error) => error === 'pdfEditResourceLimit' ? '' : error)
    return true
  }
  const clearError = (...keys: string[]) => setError((error) => keys.includes(error) ? '' : error)
  const toggleFullscreen = async () => {
    const target = workspace.current
    if (!target) return
    try {
      if (!target.requestFullscreen || !document.exitFullscreen) throw new Error('fullscreen unavailable')
      if (document.fullscreenElement) await document.exitFullscreen()
      else await target.requestFullscreen()
      if (workspace.current === target) clearError('pdfEditFullscreenError')
    } catch { if (workspace.current === target) setError('pdfEditFullscreenError') }
  }
  const restoreElementFocus = (id: string) => requestAnimationFrame(() => {
    const element = workspace.current?.querySelector<HTMLElement>(`[data-element-id="${id}"]`)
    const target = element ?? workspace.current
    target?.focus({ preventScroll: true })
  })
  const cancelCrop = () => {
    if (crop) restoreElementFocus(crop.id)
    cropGesture.current = null; setCrop(null)
  }
  const cropId = crop?.id
  useEffect(() => {
    if (cropId) workspace.current?.querySelector<HTMLElement>('.pdf-editor-crop-surface')?.focus({ preventScroll: true })
  }, [cropId])
  useEffect(() => {
    let active = true
    let task: ReturnType<typeof createPdfLoadingTask> | undefined
    sessionRef.current = null
    if (!file) return
    void (async () => {
      try {
        if (file.size > 50 * 1024 * 1024) throw new Error('limit')
        const bytes = new Uint8Array(await file.arrayBuffer())
        if (!active) return
        // Reject encrypted input instead of silently changing its protection or contents.
        const parsed = await PDFDocument.load(bytes)
        if (!active) return
        assertPdfEditorResources(parsed)
        task = createPdfLoadingTask(bytes.slice(), PDF_EDITOR_LOADING_LIMITS)
        const pdf = await task.promise
        if (!active) return
        if (pdf.numPages < 1 || pdf.numPages > 500) throw new Error('limit')
        const next = { bytes, pdf, name: file.name }
        sessionRef.current = next
        setSession(next)
      } catch (error) { await task?.destroy().catch(() => undefined); if (active) setError(error instanceof PdfInputLimitError ? 'pdfEditInputLimit' : 'pdfEditLoadError') }
      finally { if (active) setLoading(false) }
    })()
    return () => { active = false; sessionRef.current = null; void task?.destroy().catch(() => undefined) }
  }, [file])

  const chooseFile = (next: File | undefined) => {
    if (!next || busy) return
    if (dirty && !window.confirm(t('pdfEditReplace'))) return
    sessionRef.current = null
    setSession(null); setFile(next); setPage(1); setRatio(0); setSelected(null)
    setHistory({ entries: [[]], index: 0 }); setSavedItems([]); setDownloaded(false); setDraft(null); draftRef.current = null; setCrop(null); setInline(null); inlineRef.current = null; setMenu(null); setTextTool(false); setError(''); setLoading(true)
  }
  const finishText = (cancel = false, restoreFocus = false) => {
    const value = inlineRef.current
    if (!value) return null
    const close = () => { inlineRef.current = null; setInline(null); if (restoreFocus) requestAnimationFrame(() => { if (inlineRef.current || menuRef.current) return; const element = workspace.current?.querySelector<HTMLElement>(`[data-element-id="${value.id}"]`); (element ?? workspace.current)?.focus({ preventScroll: true }) }) }
    if (cancel || !value.value.trim()) { close(); clearError('pdfEditTextLimit'); return null }
    let layout: ReturnType<typeof textLayout>
    try { layout = textLayout(value.value.trim(), value.textFont ?? font, value) } catch { setError('pdfEditTextLimit'); return null }
    if (value.isNew && items.length >= 100) { setError('pdfEditResourceLimit'); return null }
    const previousLines = Math.max(1, (value.text ?? '').split('\n').length)
    let height = value.height * layout.height / (previousLines * 120 + 16)
    let width = height * layout.ratio / ratio
    const factor = Math.min(1, (1 - value.x) / width, (1 - value.y) / height)
    width *= factor; height *= factor
    const { value: text, isNew: _isNew, ...original } = value
    void _isNew
    const item: PdfOverlay = fitOverlay({ ...original, src: '', width, height, text: text.trim(), textColor: value.textColor ?? color, textFont: value.textFont ?? font }, ratio)
    const next = value.isNew ? [...items, item] : items.map((entry) => entry.id === item.id ? item : entry)
    close(); commit(next); setSelected(item.id); clearError('pdfEditTextLimit')
    return next
  }
  const changeTextStyle = (style: TextStyle) => {
    if (busy || gesture.current) return
    if (style.textColor) setColor(style.textColor)
    if (style.textFont) setFont(style.textFont)
    setTextStyle((value) => ({ ...value, ...style }))
    if (inlineRef.current) {
      const next = { ...inlineRef.current, ...style }
      inlineRef.current = next; setInline(next)
    } else if (current?.text !== undefined) {
      const textColor = style.textColor ?? current.textColor ?? color
      const textFont = style.textFont ?? current.textFont ?? 'sans-serif'
      try {
        const styled = { ...current, ...style, textColor, textFont }
        const layout = textLayout(current.text, textFont, styled)
        const next = fitOverlay({ ...styled, src: '', width: styled.height * layout.ratio / ratio }, ratio)
        commit(items.map((item) => item.id === current.id ? next : item))
        clearError('pdfEditTextLimit')
      } catch { setError('pdfEditTextLimit') }
    }
  }
  const loadDeviceFonts = async () => {
    const request = ++fontRequest.current
    setFontLoading(true); setFontNotice('')
    try {
      const result = await queryPdfFonts()
      if (request !== fontRequest.current) return
      setFonts((currentFonts) => [...new Set([...currentFonts, ...result])].sort((a, b) => a.localeCompare(b)))
      setFontNotice(result.length ? 'pdfEditFontsLoaded' : 'pdfEditFontsUnavailable')
    } catch { if (request === fontRequest.current) setFontNotice('pdfEditFontsUnavailable') }
    finally { if (request === fontRequest.current) setFontLoading(false) }
  }
  const beginText = (x: number, y: number, original?: PdfOverlay) => {
    if (busy || !ratio) return
    finishText()
    if (inlineRef.current) return
    const next: InlineText = original ? { ...original, textFont: original.textFont ?? 'sans-serif', value: original.text ?? '', isNew: false } : { ...textStyle, id: crypto.randomUUID(), page, src: '', x: Math.min(.85, Math.max(0, x)), y: Math.min(.9, Math.max(0, y)), width: .3, height: .035, value: '', textColor: color, textFont: font, isNew: true }
    inlineRef.current = next; setInline(next); setSelected(original?.id ?? null); setTextTool(false); setCrop(null); setMenu(null)
  }
  const inlineId = inline?.id
  useEffect(() => { if (inlineId) { inlineInput.current?.focus(); inlineInput.current?.select() } }, [inlineId])
  useEffect(() => {
    if (!menu) return
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const dismiss = (event: globalThis.PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(null) }
    const scroll = () => setMenu(null)
    document.addEventListener('pointerdown', dismiss)
    window.addEventListener('resize', scroll)
    const scroller = workspace.current?.querySelector('.pdf-editor-scroll')
    scroller?.addEventListener('scroll', scroll)
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('resize', scroll); scroller?.removeEventListener('scroll', scroll) }
  }, [menu])
  const openMenu = (item: PdfOverlay, x: number, y: number) => {
    if (busy) return
    setSelected(item.id)
    setMenu({ id: item.id, x: Math.max(8, Math.min(window.innerWidth - 224, x)), y: Math.max(8, Math.min(window.innerHeight - 340, y)) })
  }
  const actOnElement = (action: 'delete' | 'duplicate' | 'front' | 'back' | 'grow' | 'shrink' | 'edit' | 'rotate' | 'crop', item: PdfOverlay) => {
    if (busy) return
    setMenu(null)
    if (action === 'edit') { beginText(item.x, item.y, item); return }
    if (action === 'crop') { setCrop({ id: item.id, x: 0, y: 0, width: 1, height: 1 }); return }
    let next = items
    if (action === 'delete') { next = items.filter((entry) => entry.id !== item.id); setSelected(null) }
    if (action === 'duplicate') {
      if (items.length >= 100) { setError('pdfEditResourceLimit'); return }
      const copy = fitOverlay({ ...item, id: crypto.randomUUID(), x: item.x + .025, y: item.y + .025 }, ratio)
      next = [...items, copy]; setSelected(copy.id)
    }
    if (action === 'front') next = [...items.filter((entry) => entry.id !== item.id), item]
    if (action === 'back') next = [item, ...items.filter((entry) => entry.id !== item.id)]
    if (action === 'rotate') next = items.map((entry) => entry.id === item.id ? fitOverlay({ ...item, rotation: ((item.rotation ?? 0) + 90) % 360 }, ratio) : entry)
    if (action === 'grow' || action === 'shrink') {
      const factor = action === 'grow' ? Math.min(1.15, (1 - item.x) / item.width, (1 - item.y) / item.height) : .85
      next = items.map((entry) => entry.id === item.id ? fitOverlay({ ...item, width: item.width * factor, height: item.height * factor }, ratio) : entry)
    }
    commit(next)
    const focusId = action === 'duplicate' ? next.at(-1)?.id : item.id
    requestAnimationFrame(() => { const element = workspace.current?.querySelector<HTMLElement>(`[data-element-id="${focusId}"]`); (element ?? workspace.current)?.focus({ preventScroll: true }) })
  }
  const addImage = async (blob: Blob) => {
    const source = sessionRef.current
    const targetPage = page
    const pageRatio = ratio
    if (!source || !pageRatio || saving || gesture.current || pendingRef.current > 0) return
    finishText()
    if (inlineRef.current) return
    if (items.length >= 100) { setError('pdfEditResourceLimit'); return }
    pendingRef.current++; setPendingImages(pendingRef.current)
    try {
      const image = await imageToPng(blob)
      if (sessionRef.current === source) {
        const width = Math.min(0.3, 0.3 * image.ratio / pageRatio)
        const item = { id: crypto.randomUUID(), page: targetPage, src: image.src, x: 0.1, y: 0.1, width, height: width * pageRatio / image.ratio }
        const latest = historyRef.current.entries[historyRef.current.index]
        if (!imageBudget([...latest, item])) { setError('pdfEditResourceLimit'); return }
        setHistory((state) => appendHistory(state, [...state.entries[state.index], item]))
        setCrop(null); setDownloaded(false)
        setSelected(item.id)
        clearError('pdfEditImageError', 'pdfEditResourceLimit')
      }
    } catch { if (sessionRef.current === source) setError('pdfEditImageError') }
    finally { pendingRef.current--; if (sessionRef.current === source) setPendingImages(pendingRef.current) }
  }
  const start = (event: PointerEvent, item: PdfOverlay, resize: ResizeCorner | 'rotate' | false) => {
    if (busy || crop || event.button !== 0) return
    if (textTool && !resize && ratio) {
      event.stopPropagation(); event.preventDefault()
      const bounds = paper.current?.getBoundingClientRect()
      if (bounds) beginText((event.clientX - bounds.left) / bounds.width, (event.clientY - bounds.top) / bounds.height)
      return
    }
    setMenu(null)
    event.stopPropagation(); event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelected(item.id)
    gesture.current = { startX: event.clientX, startY: event.clientY, item, resize, before: items }
    if (resize === 'rotate') rotationDragged.current = false
    draftRef.current = null
  }
  const move = (event: PointerEvent) => {
    const state = gesture.current
    const bounds = paper.current?.getBoundingClientRect()
    if (!state || !bounds) return
    const dx = (event.clientX - state.startX) / bounds.width
    const dy = (event.clientY - state.startY) / bounds.height
    let next = { ...state.item }
    if (state.resize === 'rotate') {
      if (!rotationDragged.current && Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < 4) return
      rotationDragged.current = true
      const cx = bounds.left + (next.x + next.width / 2) * bounds.width, cy = bounds.top + (next.y + next.height / 2) * bounds.height
      const startAngle = Math.atan2(state.startY - cy, state.startX - cx)
      const angle = (state.item.rotation ?? 0) + (Math.atan2(event.clientY - cy, event.clientX - cx) - startAngle) * 180 / Math.PI
      next = fitOverlay({ ...next, rotation: event.shiftKey ? Math.round(angle / 15) * 15 : angle }, ratio)
    } else if (state.resize) next = resizeOverlay(next, state.resize, dx, dy, ratio)
    else {
      const snapped = snapOverlay({ ...next, x: next.x + dx, y: next.y + dy }, state.before, ratio, event.altKey ? 0 : 6 / bounds.width, event.altKey ? 0 : 6 / bounds.height)
      next = snapped.item; setGuides(snapped.guides)
    }
    const nextDraft = state.before.map((item) => item.id === next.id ? next : item)
    draftRef.current = nextDraft; setDraft(nextDraft)
  }
  const finish = (cancel = false) => {
    if (!gesture.current) return
    gesture.current = null
    if (!cancel && draftRef.current) commit(draftRef.current)
    else { draftRef.current = null; setDraft(null) }
    setGuides({})
  }
  const changeImageStyle = (style: Pick<PdfOverlay, 'rotation' | 'opacity'>, temporary = false) => {
    if (!current || busy || crop || gesture.current) return
    const next = items.map((item) => item.id === current.id ? fitOverlay({ ...item, ...style }, ratio) : item)
    if (temporary) { draftRef.current = next; setDraft(next) }
    else commit(next)
  }
  const cropPoint = (event: PointerEvent, item: PdfOverlay) => {
    const bounds = paper.current!.getBoundingClientRect()
    const dx = event.clientX - bounds.left - (item.x + item.width / 2) * bounds.width
    const dy = event.clientY - bounds.top - (item.y + item.height / 2) * bounds.height
    const angle = -(item.rotation ?? 0) * Math.PI / 180
    return { x: Math.max(0, Math.min(1, (Math.cos(angle) * dx - Math.sin(angle) * dy) / (item.width * bounds.width) + .5)), y: Math.max(0, Math.min(1, (Math.sin(angle) * dx + Math.cos(angle) * dy) / (item.height * bounds.height) + .5)) }
  }
  const applyCrop = async () => {
    const source = sessionRef.current
    const value = crop
    const item = items.find((entry) => entry.id === value?.id)
    if (!value || !item || !source || busy) return
    pendingRef.current++; setPendingImages(pendingRef.current)
    try {
      const image = await cropImage(item.src, value)
      if (sessionRef.current !== source) return
      const angle = (item.rotation ?? 0) * Math.PI / 180
      const ox = (value.x + value.width / 2 - .5) * item.width, oy = (value.y + value.height / 2 - .5) * item.height / ratio
      const width = item.width * value.width, height = item.height * value.height
      const next = fitOverlay({ ...item, src: image.src, x: item.x + item.width / 2 + Math.cos(angle) * ox - Math.sin(angle) * oy - width / 2, y: item.y + item.height / 2 + (Math.sin(angle) * ox + Math.cos(angle) * oy) * ratio - height / 2, width, height }, ratio)
      if (commit(items.map((entry) => entry.id === item.id ? next : entry))) {
        setCrop(null); clearError('pdfEditImageError'); restoreElementFocus(item.id)
      }
    } catch { if (sessionRef.current === source) setError('pdfEditImageError') }
    finally { pendingRef.current--; if (sessionRef.current === source) setPendingImages(pendingRef.current) }
  }
  const save = async () => {
    if (!session || saving || pendingRef.current > 0 || gesture.current || crop) return
    setSaving(true); setError('')
    try {
      const exportItems = finishText() ?? items
      if (inlineRef.current) { setSaving(false); return }
      const bytes = await exportEditedPdf(session.bytes, session.pdf, exportItems)
      await validatePdfOutput(bytes, session.pdf.numPages, [])
      if (sessionRef.current !== session) return
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }))
      downloadFromUrl(url, session.name.replace(/\.pdf$/i, '') + '-edited.pdf')
      setSavedItems(exportItems); setDownloaded(true)
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (error) { if (sessionRef.current === session) setError(error instanceof PdfExportLimitError ? 'pdfEditExportLimit' : 'pdfEditSaveError') }
    finally { if (sessionRef.current === session) setSaving(false) }
  }
  // Stable callbacks keep rendering independent of toolbar and overlay updates.
  const onReady = useRef((value: number) => { setRatio(value); setError((error) => error === 'pdfEditRenderError' ? '' : error); workspace.current?.focus({ preventScroll: true }) }).current
  const onRenderError = useRef(() => setError('pdfEditRenderError')).current
  const changePage = (value: number) => { if (value === page || crop) return; finishText(); if (inlineRef.current) return; setMenu(null); setTextTool(false); setPage(value); setRatio(0); setSelected(null); setGuides({}) }
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || busy || inlineRef.current || gesture.current || cropGesture.current || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return
      if (event.key === 'Escape') { setTextTool(false); setMenu(null); if (crop) restoreElementFocus(crop.id); setCrop(null); return }
      if (crop) return
      if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
        event.preventDefault()
        const redo = event.key.toLowerCase() === 'y' || event.shiftKey
        setHistory((state) => ({ ...state, index: Math.max(0, Math.min(state.entries.length - 1, state.index + (redo ? 1 : -1))) }))
        setSelected(null); setMenu(null)
      }
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [busy, crop])
  return <div className="flex min-w-0 flex-col gap-6" onPaste={(event) => {
    const image = Array.from(event.clipboardData.items).find((item) => item.type.startsWith('image/'))?.getAsFile()
    const editingInput = (event.target instanceof HTMLInputElement && event.target.type !== 'file') || event.target instanceof HTMLTextAreaElement
    if (image && session && ratio && !editingInput && !crop) { event.preventDefault(); void addImage(image) }
  }}>
    {session ? <div className="pdf-editor-heading"><h1>{t('pdfEditTitle')}</h1><span role="status">{dirty ? t('pdfEditUnsaved') : downloaded ? t('pdfEditDownloaded') : t('pdfEditReady')}</span></div> : <SectionHero badge={t('document')} title={t('pdfEditTitle')} description={t('pdfEditDescription')} />}
    <section className={session ? 'panel p-4 sm:p-5' : 'panel p-6 sm:p-8'}>
      <details open={!session}>
        <summary className="pdf-editor-source" hidden={!session}>
          <span className="pdf-editor-source-name">{session?.name}</span><span className="pdf-editor-source-action">{t('pdfEditChangePdf')} <span aria-hidden="true">↻</span></span>
        </summary>
        <FileDropzone
        title={t('pdfEditOpen')}
        description={t('pdfEditLocal')}
        uploadLabel={t('uploadPdfDropzone')}
        accept="application/pdf,.pdf"
        acceptedFormats="PDF"
        maxSize={50 * 1024 * 1024}
        enforceMaxSize={false}
        disabled={loading || busy}
        aside={<span className="badge">PDF</span>}
        onSelect={(files) => chooseFile(files?.[0])}
        />
      </details>
    </section>
    <div ref={workspace} tabIndex={-1} className={`pdf-editor ${thumbnails ? 'has-thumbnails' : ''}`}>
      {error && <p role="alert" className="pdf-editor-error">{t(error)}</p>}
      {loading && <p role="status" className="p-6">{t('pdfEditLoading')}</p>}
      {pendingImages > 0 && <p role="status" className="p-3">{t('pdfEditImageLoading')}</p>}
      {session && <><div className="pdf-editor-controls">
        <div className="pdf-editor-toolbar" role="group" aria-label={t('pdfEditTools')}>
          <div className="pdf-editor-tool-group">
            <button className={`pdf-editor-tool ${!textTool ? 'is-active' : ''}`} title={t('pdfEditSelect')} aria-label={t('pdfEditSelect')} aria-pressed={!textTool} onClick={() => { finishText(); if (!inlineRef.current) setTextTool(false) }}><PdfEditorIcon name="select" /></button>
            <button className="pdf-editor-tool pdf-editor-tool-label" disabled={!ratio || busy || !!crop} title={t('pdfEditImage')} onClick={() => imageInput.current?.click()}><PdfEditorIcon name="image" /><span>{t('pdfEditImages')}</span></button>
            <input ref={imageInput} className="sr-only" aria-label={t('pdfEditImage')} type="file" accept="image/png,image/jpeg,image/webp" disabled={!ratio || busy} onChange={(event) => { const image = event.target.files?.[0]; if (image) void addImage(image); event.target.value = '' }} />
            <button className={`pdf-editor-tool pdf-editor-tool-label ${textTool ? 'is-active' : ''}`} disabled={!ratio || busy || !!crop} title={t('pdfEditAddText')} aria-label={t('pdfEditAddText')} aria-pressed={textTool} onClick={(event) => { finishText(); if (inlineRef.current) return; if (event.detail === 0) { beginText(.15, .15); return } setTextTool(!textTool); setSelected(null); setMenu(null) }}><PdfEditorIcon name="text" /><span>{t('pdfEditTextTool')}</span></button>
          </div>
          <div className="pdf-editor-tool-group pdf-editor-history">
            <button className="pdf-editor-tool" title={t('pdfEditUndo')} aria-label={t('pdfEditUndo')} disabled={history.index === 0 || busy || !!inline || !!crop} onClick={() => { if (gesture.current || inlineRef.current) return; setHistory((state) => ({ ...state, index: Math.max(0, state.index - 1) })); setSelected(null); setMenu(null) }}><PdfEditorIcon name="undo" /></button>
            <button className="pdf-editor-tool" title={t('pdfEditRedo')} aria-label={t('pdfEditRedo')} disabled={history.index === history.entries.length - 1 || busy || !!inline || !!crop} onClick={() => { if (gesture.current || inlineRef.current) return; setHistory((state) => ({ ...state, index: Math.min(state.entries.length - 1, state.index + 1) })); setSelected(null); setMenu(null) }}><PdfEditorIcon name="redo" /></button>
          </div>
          <div className="pdf-editor-tool-group pdf-editor-export">
            <button className="pdf-editor-tool" title={t(fullscreen ? 'pdfEditExitFullscreen' : 'pdfEditFullscreen')} aria-label={t(fullscreen ? 'pdfEditExitFullscreen' : 'pdfEditFullscreen')} aria-pressed={fullscreen} onClick={() => void toggleFullscreen()}><PdfEditorIcon name={fullscreen ? 'exitFullscreen' : 'fullscreen'} /></button>
            <button className="btn-download pdf-editor-download" disabled={busy || !ratio || !!crop} onClick={() => void save()}><PdfEditorIcon name="download" /><span>{t(saving ? 'pdfEditSaving' : 'pdfEditDownload')}</span></button>
          </div>
        </div>
        <div className="pdf-editor-navigation">
          <div className="pdf-editor-tool-group">
            <button className={`pdf-editor-tool ${thumbnails ? 'is-active' : ''}`} title={t('pdfEditPages')} aria-label={t('pdfEditPages')} aria-expanded={thumbnails} onClick={() => setThumbnails(!thumbnails)}><PdfEditorIcon name="pages" /></button>
            <button className="pdf-editor-tool" disabled={page === 1 || busy} aria-label={t('pdfEditPrevious')} title={t('pdfEditPrevious')} onClick={() => changePage(page - 1)}>‹</button>
            <label>{t('pdfEditPage')} <select aria-label={t('pdfEditPage')} disabled={busy} value={page} onChange={(event) => changePage(Number(event.target.value))}>{Array.from({ length: session.pdf.numPages }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}</select><span className="pdf-editor-page-count"> / {session.pdf.numPages}</span></label>
            <button className="pdf-editor-tool" disabled={page === session.pdf.numPages || busy} aria-label={t('pdfEditNext')} title={t('pdfEditNext')} onClick={() => changePage(page + 1)}>›</button>
          </div>
          <span className="pdf-editor-filename" title={session.name}>{session.name}</span>
          <label className="pdf-editor-zoom">{t('pdfEditZoom')} <select aria-label={t('pdfEditZoom')} value={zoom} onChange={(event) => setZoom(event.target.value)}><option value="width">{t('pdfEditFitWidth')}</option><option value="page">{t('pdfEditFitPage')}</option>{[75, 100, 125, 150, 200].map((value) => <option key={value} value={value}>{value}%</option>)}</select></label>
        </div>
        <div className="pdf-editor-guidance"><span className="pdf-editor-mode">{t(textTool || inline ? 'pdfEditTextTool' : 'pdfEditReady')}</span><span id="pdf-editor-writing-hint">{t(textTool || inline ? 'pdfEditPlaceText' : 'pdfEditCanvasHint')}</span>
        </div>
        <div className="pdf-editor-format-slot"><div hidden={!!current && current.text === undefined} className="pdf-editor-text-format" role="group" aria-label={t('pdfEditTextStyle')}>
          <label className="pdf-editor-font-label">{t('pdfEditFont')}
            <select data-pdf-text-format aria-label={t('pdfEditFont')} disabled={busy} value={inline?.textFont ?? current?.textFont ?? font} style={{ fontFamily: pdfFontFamily(inline?.textFont ?? current?.textFont ?? font) }} onChange={(event) => changeTextStyle({ textFont: event.target.value })}>
              {[...new Set([...fonts, inline?.textFont ?? current?.textFont ?? font])].map((name) => <option key={name} value={name} style={{ fontFamily: pdfFontFamily(name) }}>{name === 'sans-serif' ? t('pdfEditSansSerif') : name === 'serif' ? t('pdfEditSerif') : name === 'monospace' ? t('pdfEditMonospace') : name}</option>)}
            </select>
          </label>
          <label className="pdf-editor-color" title={t('pdfEditColor')}><input aria-label={t('pdfEditColor')} type="color" disabled={busy} value={inline?.textColor ?? current?.textColor ?? color} onChange={(event) => changeTextStyle({ textColor: event.target.value })} /></label>
          <div className="pdf-editor-tool-group">
            <button data-pdf-text-format className={`pdf-editor-tool ${activeText.textBold ? 'is-active' : ''}`} disabled={busy} title={t('pdfEditBold')} aria-label={t('pdfEditBold')} aria-pressed={!!activeText.textBold} onClick={() => changeTextStyle({ textBold: !activeText.textBold })}><PdfEditorIcon name="bold" /></button>
            <button data-pdf-text-format className={`pdf-editor-tool ${activeText.textItalic ? 'is-active' : ''}`} disabled={busy} title={t('pdfEditItalic')} aria-label={t('pdfEditItalic')} aria-pressed={!!activeText.textItalic} onClick={() => changeTextStyle({ textItalic: !activeText.textItalic })}><PdfEditorIcon name="italic" /></button>
            {(['left', 'center', 'right'] as const).map((alignment) => <button key={alignment} data-pdf-text-format className={`pdf-editor-tool ${(activeText.textAlign ?? 'left') === alignment ? 'is-active' : ''}`} disabled={busy} title={t(alignment === 'left' ? 'pdfEditAlignLeft' : alignment === 'center' ? 'pdfEditAlignCenter' : 'pdfEditAlignRight')} aria-label={t(alignment === 'left' ? 'pdfEditAlignLeft' : alignment === 'center' ? 'pdfEditAlignCenter' : 'pdfEditAlignRight')} aria-pressed={(activeText.textAlign ?? 'left') === alignment} onClick={() => changeTextStyle({ textAlign: alignment })}><PdfEditorIcon name={alignment} /></button>)}
          </div>
          {canQueryPdfFonts() && <button className="pdf-editor-tool pdf-editor-device-fonts" title={t('pdfEditDeviceFonts')} aria-label={t('pdfEditDeviceFonts')} disabled={fontLoading || busy} onClick={() => void loadDeviceFonts()}><span aria-hidden="true">Aa+</span></button>}
          {fontNotice && <span role="status" className="pdf-editor-font-notice">{t(fontNotice)}</span>}
        </div>
        {current && current.text === undefined && <div className="pdf-editor-image-format" role="group" aria-label={t('pdfEditImageOptions')}>
          <button className="pdf-editor-tool" disabled={busy || !!crop} title={t('pdfEditRotate')} aria-label={t('pdfEditRotate')} onClick={() => actOnElement('rotate', current)}><PdfEditorIcon name="rotate" /></button>
          <button className="pdf-editor-tool" disabled={busy || !!crop} title={t('pdfEditCrop')} aria-label={t('pdfEditCrop')} onClick={() => actOnElement('crop', current)}><PdfEditorIcon name="crop" /></button>
          <label>{t('pdfEditOpacity')}<input type="range" min="0.05" max="1" step="0.05" disabled={busy || !!crop} aria-label={t('pdfEditOpacity')} value={current.opacity ?? 1} onChange={(event) => changeImageStyle({ opacity: Number(event.target.value) }, true)} onPointerUp={() => { if (draftRef.current) commit(draftRef.current) }} onPointerCancel={() => { draftRef.current = null; setDraft(null) }} onBlur={() => { if (draftRef.current) commit(draftRef.current) }} onKeyUp={() => { if (draftRef.current) commit(draftRef.current) }} /></label>
        </div>}
        </div>
        {crop && <div className="pdf-editor-crop-actions"><span>{t('pdfEditCropHint')}</span><button disabled={busy} onClick={cancelCrop}>{t('pdfEditCancel')}</button><button disabled={busy} onClick={() => void applyCrop()}>{t('pdfEditApplyCrop')}</button></div>}
        </div>
        <div className="pdf-editor-body">
        {thumbnails && <PdfPageThumbnails pdf={session.pdf} page={page} disabled={busy || !!crop} onSelect={changePage} />}
        <div className="pdf-editor-scroll">
          <div ref={paper} className={`pdf-editor-paper ${textTool ? 'is-text-mode' : ''}`} style={{ width: paperWidth }} onPointerDown={(event) => {
            if (event.button !== 0 || busy || crop) return
            setMenu(null)
            if (textTool && ratio) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); beginText((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height) }
            else { finishText(); setSelected(null); workspace.current?.focus({ preventScroll: true }) }
          }}>
            <PageCanvas key={page} pdf={session.pdf} page={page} onReady={onReady} onError={onRenderError} />
            {!ratio && <div className="pdf-editor-page-loading" role="status">{t('pdfEditLoading')}</div>}
            {ratio > 0 && items.filter((item) => item.page === page && item.id !== inline?.id).map((item, index) => <div key={item.id} data-element-id={item.id} role="button" tabIndex={0} aria-label={[t('pdfEditElement'), index + 1, item.text === undefined ? t('pdfEditImageElement') : `${t('pdfEditTextTool')}: ${item.text.slice(0, 80)}`].join(' · ')} aria-pressed={selected === item.id} className={`pdf-editor-overlay ${selected === item.id ? 'is-selected' : ''}`} style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%`, width: `${item.width * 100}%`, height: `${item.height * 100}%`, transform: `rotate(${item.rotation ?? 0}deg)` }} onFocus={() => { if (!crop) setSelected(item.id) }} onDoubleClick={() => { if (!crop && item.text !== undefined) beginText(item.x, item.y, item) }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (!crop) openMenu(item, event.clientX, event.clientY) }} onPointerDown={(event) => start(event, item, false)} onPointerMove={move} onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={() => finish(true)} onKeyDown={(event) => {
              if (busy || crop) return
              if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); const bounds = event.currentTarget.getBoundingClientRect(); openMenu(item, bounds.left, bounds.top); return }
              if ((event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) {
                event.preventDefault()
                if (event.key === 'Enter' && item.text !== undefined) beginText(item.x, item.y, item)
                else { const bounds = event.currentTarget.getBoundingClientRect(); openMenu(item, bounds.left, bounds.top) }
                return
              }
              if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); commit(items.filter((entry) => entry.id !== item.id)); setSelected(null) }
              const delta = event.shiftKey ? 0.02 : 0.002
              const offsets: Record<string, [number, number]> = { ArrowLeft: [-delta, 0], ArrowRight: [delta, 0], ArrowUp: [0, -delta], ArrowDown: [0, delta] }
              if (offsets[event.key]) { event.preventDefault(); const [x, y] = offsets[event.key]; commit(items.map((entry) => entry.id === item.id ? fitOverlay({ ...item, x: item.x + x, y: item.y + y }, ratio) : entry)) }
            }}>
              <div className="pdf-editor-object-content" style={{ opacity: item.opacity ?? 1 }}>{item.text !== undefined ? <PdfTextPreview item={item} /> : <img src={item.src} alt="" draggable={false} />}</div>
              {selected === item.id && !crop && <div className="pdf-editor-object-tools" onPointerDown={(event) => event.stopPropagation()}>
                <button disabled={busy} className="pdf-editor-rotate-handle" title={t('pdfEditRotateDrag')} aria-label={t('pdfEditRotateDrag')} onPointerDown={(event) => start(event, item, 'rotate')} onClick={(event) => { event.stopPropagation(); if (event.detail > 0 && rotationDragged.current) return; actOnElement('rotate', item) }} onDoubleClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (busy) return; if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); event.stopPropagation(); changeImageStyle({ rotation: (item.rotation ?? 0) + (event.key === 'ArrowLeft' ? -15 : 15) }) } }}><PdfEditorIcon name="rotate" /></button>
                <button className="pdf-editor-object-menu" disabled={busy} aria-label={t('pdfEditOptions')} title={t('pdfEditOptions')} onClick={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); openMenu(item, bounds.left, bounds.bottom) }}><PdfEditorIcon name="more" /></button>
              </div>}
              {selected === item.id && !crop && <>
                {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => <button key={corner} disabled={busy} className={`pdf-editor-resize is-${corner}`} aria-label={`${t('pdfEditResize')} · ${t(corner === 'nw' ? 'pdfEditCornerNW' : corner === 'ne' ? 'pdfEditCornerNE' : corner === 'sw' ? 'pdfEditCornerSW' : 'pdfEditCornerSE')}`} onPointerDown={(event) => start(event, item, corner)} onKeyDown={(event) => { if (busy) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); const next = resizeOverlayByFactor(item, corner, event.shiftKey ? .9 : 1.1, ratio); commit(items.map((entry) => entry.id === item.id ? next : entry)) } }} />)}
              </>}
              {crop?.id === item.id && <div className="pdf-editor-crop-surface" aria-label={t('pdfEditCropHint')} role="group" tabIndex={0} onKeyDown={(event) => { if (busy || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return; event.preventDefault(); event.stopPropagation(); const dx = event.key === 'ArrowLeft' ? -.02 : event.key === 'ArrowRight' ? .02 : 0, dy = event.key === 'ArrowUp' ? -.02 : event.key === 'ArrowDown' ? .02 : 0; setCrop(event.shiftKey ? { ...crop, width: Math.max(.02, Math.min(1 - crop.x, crop.width + dx)), height: Math.max(.02, Math.min(1 - crop.y, crop.height + dy)) } : { ...crop, x: Math.max(0, Math.min(1 - crop.width, crop.x + dx)), y: Math.max(0, Math.min(1 - crop.height, crop.y + dy)) }) }} onPointerDown={(event) => { if (busy) return; event.stopPropagation(); event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); cropGesture.current = cropPoint(event, item) }} onPointerMove={(event) => { if (!cropGesture.current) return; event.stopPropagation(); const end = cropPoint(event, item), begin = cropGesture.current; const x = Math.min(.98, begin.x, end.x), y = Math.min(.98, begin.y, end.y); setCrop({ id: item.id, x, y, width: Math.min(1 - x, Math.max(.02, Math.abs(end.x - begin.x))), height: Math.min(1 - y, Math.max(.02, Math.abs(end.y - begin.y))) }) }} onPointerUp={(event) => { event.stopPropagation(); cropGesture.current = null }} onPointerCancel={() => { cropGesture.current = null }} onLostPointerCapture={() => { cropGesture.current = null }}>
                <div className="pdf-editor-crop-box" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} />
              </div>}
            </div>)}
            {guides.x !== undefined && <div className="pdf-editor-guide is-vertical" style={{ left: `${guides.x * 100}%` }} />}
            {guides.y !== undefined && <div className="pdf-editor-guide is-horizontal" style={{ top: `${guides.y * 100}%` }} />}
            {inline && inline.page === page && <textarea wrap="off" ref={inlineInput} className="pdf-editor-inline-text" aria-label={t('pdfEditText')} aria-describedby="pdf-editor-writing-hint" placeholder={t('pdfEditWriteHere')} maxLength={2000} rows={Math.min(12, Math.max(2, inline.value.split('\n').length))} style={{ left: `${inline.x * 100}%`, top: `${inline.y * 100}%`, width: `${Math.min(1 - inline.x, Math.max(.3, inline.width)) * 100}%`, minHeight: `${Math.max(.07, inline.height) * paperWidth / (ratio || 1)}px`, color: inline.textColor ?? color, fontFamily: pdfFontFamily(inline.textFont ?? font), fontWeight: inline.textBold ? 700 : 400, fontStyle: inline.textItalic ? 'italic' : 'normal', textAlign: inline.textAlign ?? 'left', transform: `rotate(${inline.rotation ?? 0}deg)`, transformOrigin: `${inline.width * paperWidth / 2}px ${inline.height * paperWidth / (ratio || 1) / 2}px`, fontSize: Math.max(12, paperWidth / (ratio || 1) * inline.height * 96 / (Math.max(1, (inline.text ?? '').split('\n').length) * 120 + 16)) }} value={inline.value} onPointerDown={(event) => event.stopPropagation()} onChange={(event) => { const next = { ...inline, value: event.target.value }; inlineRef.current = next; setInline(next) }} onBlur={(event) => { if ((event.relatedTarget instanceof HTMLInputElement && event.relatedTarget.type === 'color') || (event.relatedTarget instanceof HTMLElement && event.relatedTarget.hasAttribute('data-pdf-text-format'))) return; finishText() }} onKeyDown={(event) => { event.stopPropagation(); if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return; if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); finishText(false, true) } if (event.key === 'Escape') { event.preventDefault(); finishText(true, true) } }} />}
          </div>
        </div>
        </div>
        {menu && <div ref={menuRef} className="pdf-editor-menu" role="menu" aria-label={t('pdfEditOptions')} style={{ left: menu.x, top: menu.y }} onKeyDown={(event) => {
          const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'))
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus() }
          if (event.key === 'Escape' || event.key === 'Tab') { setMenu(null); if (event.key === 'Escape') { event.preventDefault(); workspace.current?.querySelector<HTMLElement>(`[data-element-id="${menu.id}"]`)?.focus() } }
        }}>
          {(() => {
            const item = items.find((entry) => entry.id === menu.id)
            if (!item) return null
            const actions = [
              ...(item.text !== undefined ? [{ action: 'edit' as const, key: 'pdfEditEditText', icon: 'edit' as const }] : []),
              { action: 'rotate' as const, key: 'pdfEditRotate', icon: 'rotate' as const },
              ...(item.text === undefined ? [{ action: 'crop' as const, key: 'pdfEditCrop', icon: 'crop' as const }] : []),
              { action: 'duplicate' as const, key: 'pdfEditDuplicate', icon: 'copy' as const },
              { action: 'grow' as const, key: 'pdfEditGrow', icon: 'grow' as const },
              { action: 'shrink' as const, key: 'pdfEditShrink', icon: 'shrink' as const },
              { action: 'front' as const, key: 'pdfEditBringFront', icon: 'front' as const },
              { action: 'back' as const, key: 'pdfEditSendBack', icon: 'back' as const },
              { action: 'delete' as const, key: 'pdfEditDelete', icon: 'delete' as const },
            ]
            return actions.map((action) => <button key={action.action} role="menuitem" className={action.action === 'delete' ? 'is-danger' : ''} onClick={() => actOnElement(action.action, item)}><PdfEditorIcon name={action.icon} /><span>{t(action.key)}</span></button>)
          })()}
        </div>}
      </>}
    </div>
  </div>
}
