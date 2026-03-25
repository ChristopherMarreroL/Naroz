import { useEffect, useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { EmptyState } from '../../components/shared/EmptyState'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { createDocumentItem, isSupportedPdf, type DocumentItem } from './lib/files'
import { renderPdfPagePreview, usePdfPageRemover } from './hooks/usePdfPageRemover'

export function PdfDeletePagesView() {
  const { t } = useLocale()
  const [documentItem, setDocumentItem] = useState<DocumentItem | null>(null)
  const [previewPage, setPreviewPage] = useState<number | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewUrlPage, setPreviewUrlPage] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ tone: 'info' | 'success' | 'error'; title: string; message: string } | null>({
    tone: 'info',
    title: t('documentLocalProcessing'),
    message: t('deletePdfPagesCardDesc'),
  })

  const {
    progress,
    isProcessing,
    result,
    error,
    loadPdf,
    deletePages,
    pageCount,
    pagePreviews,
    selectedPages,
    selectedCount,
    togglePageSelection,
    selectAllPages,
    clearSelection,
  } = usePdfPageRemover()

  const pageCountLabel = useMemo(() => (pageCount ? `${pageCount}` : '--'), [pageCount])

  const clearAll = () => {
    setDocumentItem(null)
    clearSelection()
    closePreview()
    setNotice({ tone: 'info', title: t('contentCleared'), message: t('deletePdfPagesCardDesc') })
  }

  const closePreview = () => {
    setPreviewPage(null)
    setPreviewUrlPage(null)
    setPreviewUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current)
      }

      return null
    })
  }

  useEffect(() => {
    if (!previewPage || !documentItem) {
      return undefined
    }

    let isActive = true

    void renderPdfPagePreview(documentItem.file, previewPage, 1.9)
      .then((url) => {
        if (!isActive) {
          URL.revokeObjectURL(url)
          return
        }

        setPreviewUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current)
          }

          return url
        })
        setPreviewUrlPage(previewPage)
      })

    return () => {
      isActive = false
    }
  }, [documentItem, previewPage])

  const handleSelectFile = async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) {
      return
    }

    if (!isSupportedPdf(file)) {
      setNotice({ tone: 'error', title: t('unsupportedFile'), message: t('pdfOnlyAccepted') })
      return
    }

    const item = createDocumentItem(file, 'pdf')
    setDocumentItem(item)

    try {
      const loaded = await loadPdf(file)
      setNotice({
        tone: 'success',
        title: t('documentsAdded'),
        message: `${t('deletePdfPagesStatusDesc')} (${loaded.totalPages} ${t('pages')})`,
      })
    } catch (loadError) {
      setNotice({
        tone: 'error',
        title: t('deletePdfPagesError'),
        message: loadError instanceof Error ? loadError.message : t('pdfMergeError'),
      })
    }
  }

  const handleDeletePages = async () => {
    if (!documentItem) {
      setNotice({ tone: 'error', title: t('documentsRequired'), message: t('selectPdf') })
      return
    }

    const deleted = await deletePages(documentItem.file, selectedPages)
    if (deleted) {
      setNotice({ tone: 'success', title: t('deletePdfPagesCompleted'), message: t('deletePdfPagesCompletedMessage') })
    }
  }

  const isPreviewLoading = previewPage !== null && previewUrlPage !== previewPage

  return (
    <>
      <SectionHero
        badge={t('deletePdfPagesBadge')}
        title={t('deletePdfPagesTitle')}
        description={t('deletePdfPagesDesc')}
        aside={
          <div className="rounded-[1.5rem] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{t('currentScope')}</p>
            <div className="mt-4 space-y-2 text-sm text-slate-200">
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('input')}: PDF</div>
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('output')}: PDF</div>
            </div>
          </div>
        }
      />

      <div className="grid gap-6 min-[1700px]:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel p-6 sm:p-8">
          <FileDropzone
            title={t('deletePdfPagesCardTitle')}
            description={t('deletePdfPagesCardDesc')}
            buttonLabel={t('selectPdf')}
            accept="application/pdf,.pdf"
            disabled={isProcessing}
            aside={<span className="badge">PDF</span>}
            onSelect={(files) => void handleSelectFile(files)}
          />

          {error ? <div className="mt-6"><AlertBanner tone="error" title={t('deletePdfPagesError')} message={error} /></div> : null}
          {notice ? <div className="mt-6"><AlertBanner tone={notice.tone} title={notice.title} message={notice.message} /></div> : null}

          {documentItem ? (
            <div className="mt-6 grid gap-5 2xl:grid-cols-[280px_minmax(0,1fr)]">
              <div className="panel-subtle p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('name')}</p>
                <p className="mt-2 break-words text-sm font-semibold text-slate-900">{documentItem.name}</p>
                <p className="mt-3 text-xs text-slate-500">PDF · {formatBytes(documentItem.size)}</p>
                <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">{t('deletePdfPagesHint')}</p>

                <div className="mt-4 grid gap-2">
                  <button type="button" className="btn-secondary" onClick={selectAllPages} disabled={isProcessing || pagePreviews.length === 0}>
                    {t('selectAll')}
                  </button>
                  <button type="button" className="btn-secondary" onClick={clearSelection} disabled={isProcessing || selectedPages.length === 0}>
                    {t('clearSelection')}
                  </button>
                  <button type="button" className="btn-secondary" onClick={clearAll} disabled={isProcessing || !documentItem}>
                    {t('clearContent')}
                  </button>
                </div>
              </div>

              <div className="grid gap-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('documentsCount')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">1</p>
                  </div>
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('size')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{formatBytes(documentItem.size)}</p>
                  </div>
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('output')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">PDF</p>
                  </div>
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('pages')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{pageCountLabel}</p>
                  </div>
                </div>

                <div className="panel-subtle p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{t('deletePdfPagesCardTitle')}</h3>
                      <p className="mt-1 text-sm text-slate-600">{t('deletePdfPagesCardDesc')}</p>
                    </div>
                    <span className="badge">{selectedCount} {t('selected')}</span>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {pagePreviews.map((preview) => {
                      const isSelected = selectedPages.includes(preview.pageNumber)
                      return (
                        <button
                          key={preview.pageNumber}
                          type="button"
                          onClick={() => setPreviewPage(preview.pageNumber)}
                          className={`group overflow-hidden rounded-3xl border p-3 text-left transition ${isSelected ? 'border-rose-300 bg-rose-50 shadow-[0_12px_24px_-18px_rgba(244,63,94,0.45)]' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                          disabled={isProcessing}
                        >
                          <div className="relative overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200">
                            <img src={preview.thumbnailUrl} alt={`${t('page')} ${preview.pageNumber}`} className="aspect-[3/4] h-full w-full object-contain bg-white p-1" />
                            <div className="absolute left-3 top-3 rounded-full bg-slate-950/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                              {t('page')} {preview.pageNumber}
                            </div>
                            <div className={`absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border ${isSelected ? 'border-rose-600 bg-rose-600 text-white' : 'border-white/70 bg-white/90 text-slate-400'}`}>
                              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                                <path d="M5 12l4 4L19 6" />
                              </svg>
                            </div>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-500">
                            <span className="font-semibold text-slate-700">{t('page')} {preview.pageNumber}</span>
                            <span className="font-semibold text-rose-600">{isSelected ? t('selected') : t('viewLarge')}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button type="button" className="btn-primary w-full sm:w-auto" onClick={handleDeletePages} disabled={isProcessing || selectedCount === 0}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                        <path d="M8 4h8M9 8h6M10 12h4" />
                        <path d="M9 16h6" />
                      </svg>
                      {isProcessing ? t('deletingPdfPages') : t('deletePdfPagesBtn')}
                    </button>
                    {result ? (
                      <button type="button" className="btn-download w-full sm:w-auto" onClick={() => downloadFromUrl(result.url, result.fileName)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                          <path d="M12 4v10" />
                          <path d="m8 10 4 4 4-4" />
                          <path d="M5 19h14" />
                        </svg>
                        {t('downloadMergedPdf')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState badge={t('noDocuments')} title={t('emptyPdfTitle')} description={t('emptyPdfDesc')} />
            </div>
          )}
        </section>

        <section className="panel p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold text-slate-950">{t('deletePdfPagesStatusTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('deletePdfPagesStatusDesc')}</p>

          <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-slate-950 transition-all duration-300" style={{ width: `${progress.percent}%` }} />
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <span>{progress.stage}</span>
            <span>{progress.percent}%</span>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('progressDetail')}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{progress.detail ?? t('waitingFile')}</p>
            </div>
            {result ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">{t('deletePdfPagesReady')}</p>
                <p className="mt-2 text-sm leading-6 text-emerald-700">{result.fileName} · {formatBytes(result.size)}</p>
                <p className="mt-2 text-xs text-emerald-700">{t('deletePdfPagesReadyHint')}</p>
              </div>
            ) : null}
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-700">
              {t('deletePdfPagesHint')}
            </div>
          </div>
        </section>
      </div>

      {previewPage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-3 py-4 backdrop-blur-sm sm:px-6">
          <div className="w-full max-w-7xl rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_90px_-25px_rgba(15,23,42,0.65)]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{t('pagePreview')}</p>
                <h3 className="mt-1 text-lg font-extrabold text-slate-950">{t('page')} {previewPage}</h3>
              </div>
              <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50" onClick={closePreview}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.9">
                  <path d="M6 6 18 18M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
                <div className="relative flex min-h-[55vh] items-center justify-center overflow-auto rounded-[1.25rem] bg-white p-4">
                  <button
                    type="button"
                    className="absolute left-3 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.45)] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() => setPreviewPage((current) => Math.max(1, (current ?? 1) - 1))}
                    disabled={previewPage <= 1}
                    aria-label={t('previousPage')}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="2">
                      <path d="m15 6-6 6 6 6" />
                    </svg>
                  </button>

                  {isPreviewLoading || !previewUrl ? (
                    <div className="text-sm text-slate-500">{t('loadingTool')}</div>
                  ) : (
                    <img src={previewUrl} alt={`${t('page')} ${previewPage}`} className="max-h-[78vh] w-auto max-w-full object-contain" />
                  )}

                  <button
                    type="button"
                    className="absolute right-3 top-1/2 z-10 inline-flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.45)] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() => setPreviewPage((current) => Math.min(pageCount ?? 1, (current ?? 1) + 1))}
                    disabled={previewPage >= (pageCount ?? 1)}
                    aria-label={t('nextPage')}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth="2">
                      <path d="m9 6 6 6-6 6" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="grid gap-4">
                <div className="panel-subtle p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('deletePdfPagesCardTitle')}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{t('deletePdfPagesDesc')}</p>
                </div>

                <div className="panel-subtle p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('selected')}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{selectedCount} {t('pages')}</p>
                  <p className="mt-2 text-xs text-slate-500">{selectedPages.includes(previewPage) ? t('pageSelectedHint') : t('pageNotSelectedHint')}</p>
                </div>

                <button type="button" className="btn-primary w-full" onClick={() => togglePageSelection(previewPage)}>
                  {selectedPages.includes(previewPage) ? t('remove') : t('select')}
                </button>

              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
