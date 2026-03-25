import { useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { EmptyState } from '../../components/shared/EmptyState'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { createDocumentItem, isSupportedPdf, type DocumentItem } from './lib/files'
import { usePdfPageRemover } from './hooks/usePdfPageRemover'

export function PdfDeletePagesView() {
  const { t } = useLocale()
  const [documentItem, setDocumentItem] = useState<DocumentItem | null>(null)
  const [pagesToDelete, setPagesToDelete] = useState('')
  const [notice, setNotice] = useState<{ tone: 'info' | 'success' | 'error'; title: string; message: string } | null>({
    tone: 'info',
    title: t('documentLocalProcessing'),
    message: t('deletePdfPagesCardDesc'),
  })
  const { progress, isProcessing, result, error, inspectPdf, deletePages, pageCount } = usePdfPageRemover()

  const pageCountLabel = useMemo(() => (pageCount ? `${pageCount}` : '--'), [pageCount])

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
      const total = await inspectPdf(file)
      setNotice({
        tone: 'success',
        title: t('documentsAdded'),
        message: `${t('deletePdfPagesStatusDesc')} (${total} ${t('pages')})`,
      })
    } catch (inspectError) {
      setNotice({
        tone: 'error',
        title: t('deletePdfPagesError'),
        message: inspectError instanceof Error ? inspectError.message : t('pdfMergeError'),
      })
    }
  }

  const handleDeletePages = async () => {
    if (!documentItem) {
      setNotice({ tone: 'error', title: t('documentsRequired'), message: t('selectPdf') })
      return
    }

    const deleted = await deletePages(documentItem.file, pagesToDelete)
    if (deleted) {
      setNotice({ tone: 'success', title: t('deletePdfPagesCompleted'), message: t('deletePdfPagesCompletedMessage') })
    }
  }

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
                  <label className="text-sm font-semibold text-slate-900" htmlFor="pages-to-delete">{t('deletePdfPagesInputLabel')}</label>
                  <input
                    id="pages-to-delete"
                    type="text"
                    value={pagesToDelete}
                    onChange={(event) => setPagesToDelete(event.target.value)}
                    placeholder={t('deletePdfPagesPlaceholder')}
                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                    disabled={isProcessing}
                  />
                  <p className="mt-2 text-xs text-slate-500">{t('deletePdfPagesInputHelp')}</p>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button type="button" className="btn-primary w-full sm:w-auto" onClick={handleDeletePages} disabled={isProcessing}>
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
    </>
  )
}
