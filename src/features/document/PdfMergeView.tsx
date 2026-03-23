import { useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { EmptyState } from '../../components/shared/EmptyState'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { DocumentQueue } from './components/DocumentQueue'
import { usePdfMerger } from './hooks/usePdfMerger'
import { createDocumentItem, getTotalSize, isSupportedPdf, moveDocument, type DocumentItem } from './lib/files'

export function PdfMergeView() {
  const { locale, t } = useLocale()
  const [items, setItems] = useState<DocumentItem[]>([])
  const [notice, setNotice] = useState<{ tone: 'info' | 'success' | 'error'; title: string; message: string } | null>({
    tone: 'info',
    title: t('documentLocalProcessing'),
    message: locale === 'es' ? 'Agrega varios PDF, ordenalos y genera un solo archivo final.' : 'Add multiple PDFs, reorder them, and generate one final file.',
  })
  const { progress, isProcessing, result, error, mergePdfFiles } = usePdfMerger()

  const totalSize = useMemo(() => getTotalSize(items), [items])

  const handleSelectFiles = (fileList: FileList | null) => {
    if (!fileList?.length) {
      return
    }

    const files = Array.from(fileList)
    const invalid = files.find((file) => !isSupportedPdf(file))
    if (invalid) {
      setNotice({ tone: 'error', title: t('unsupportedFile'), message: locale === 'es' ? 'Solo se admiten archivos PDF en esta herramienta.' : 'Only PDF files are supported in this tool.' })
      return
    }

    setItems(files.map((file) => createDocumentItem(file, 'pdf')))
    setNotice({ tone: 'success', title: t('documentsAdded'), message: locale === 'es' ? 'La lista actual se actualizo con los PDF seleccionados. Ya puedes reorganizarlos antes de unirlos.' : 'The current list was updated with the selected PDFs. You can now reorder them before merging.' })
  }

  const handleMerge = async () => {
    if (items.length < 2) {
      setNotice({ tone: 'error', title: t('documentsRequired'), message: locale === 'es' ? 'Agrega al menos dos PDF para poder unirlos.' : 'Add at least two PDFs to merge them.' })
      return
    }

    const merged = await mergePdfFiles(items.map((item) => item.file))
    if (merged) {
      setNotice({ tone: 'success', title: t('pdfMergeCompleted'), message: locale === 'es' ? 'Tu PDF unido ya esta listo para descargar.' : 'Your merged PDF is ready to download.' })
    }
  }

  return (
    <>
      <SectionHero
        badge={locale === 'es' ? 'Documentos / Unir PDF' : 'Documents / Merge PDF'}
        title={t('pdfMergeTitle')}
        description={t('pdfMergeDesc')}
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
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-950">{t('pdfMergeCardTitle')}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{t('pdfMergeCardDesc')}</p>
            </div>

            <label className="btn-primary w-full cursor-pointer justify-center sm:w-auto">
              {t('selectPdf')}
              <input
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(event) => {
                  handleSelectFiles(event.target.files)
                  event.target.value = ''
                }}
              />
            </label>
          </div>

          {error ? <div className="mt-6"><AlertBanner tone="error" title={t('pdfMergeError')} message={error} /></div> : null}
          {notice ? <div className="mt-6"><AlertBanner tone={notice.tone} title={notice.title} message={notice.message} /></div> : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('documentsCount')}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{items.length}</p>
            </div>
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('size')}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{formatBytes(totalSize)}</p>
            </div>
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('output')}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">PDF</p>
            </div>
          </div>

          <div className="mt-6">
            {items.length > 0 ? (
              <DocumentQueue
                items={items}
                emptyMessage={t('emptyPdfQueue')}
                onMoveUp={(index) => setItems((current) => moveDocument(current, index, index - 1))}
                onMoveDown={(index) => setItems((current) => moveDocument(current, index, index + 1))}
                onRemove={(id) => setItems((current) => current.filter((item) => item.id !== id))}
                disabled={isProcessing}
              />
            ) : (
              <EmptyState badge={t('noDocuments')} title={t('emptyPdfTitle')} description={t('emptyPdfDesc')} />
            )}
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-2 xl:flex xl:flex-wrap">
            <button type="button" className="btn-primary w-full sm:w-auto" onClick={handleMerge} disabled={isProcessing || items.length < 2}>
              {isProcessing ? t('mergingDocuments') : t('mergePdfBtn')}
            </button>
            {items.length > 0 ? (
              <button
                type="button"
                className="btn-secondary w-full sm:w-auto"
                onClick={() => {
                  setItems([])
                  setNotice({ tone: 'info', title: t('documentLocalProcessing'), message: locale === 'es' ? 'La lista de PDF se vacio. Selecciona los archivos que quieras unir.' : 'The PDF list was cleared. Select the files you want to merge.' })
                }}
                disabled={isProcessing}
              >
                {locale === 'es' ? 'Vaciar lista' : 'Clear list'}
              </button>
            ) : null}
            {result ? (
              <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => downloadFromUrl(result.url, result.fileName)}>
                {t('downloadMergedPdf')}
              </button>
            ) : null}
          </div>
        </section>

        <section className="panel p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold text-slate-950">{t('documentStatusTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('documentStatusDesc')}</p>

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
                <p className="text-sm font-semibold text-emerald-700">{t('documentReady')}</p>
                <p className="mt-2 text-sm leading-6 text-emerald-700">{result.fileName} · {formatBytes(result.size)}</p>
              </div>
            ) : null}
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-700">{t('pdfMergeHint')}</div>
          </div>
        </section>
      </div>
    </>
  )
}
