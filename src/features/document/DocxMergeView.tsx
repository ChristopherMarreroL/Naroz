import { useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { BetaNotice } from '../../components/shared/BetaNotice'
import { EmptyState } from '../../components/shared/EmptyState'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { DocumentQueue } from './components/DocumentQueue'
import { useDocxMerger } from './hooks/useDocxMerger'
import { createDocumentItem, getTotalSize, isSupportedDocx, moveDocument, type DocumentItem } from './lib/files'

export function DocxMergeView() {
  const { t } = useLocale()
  const [items, setItems] = useState<DocumentItem[]>([])
  const [notice, setNotice] = useState<{ tone: 'info' | 'success' | 'error'; title: string; message: string } | null>({
    tone: 'info',
    title: t('documentLocalProcessing'),
    message: t('docxMergeCardDesc'),
  })
  const { progress, isProcessing, result, error, mergeDocxFiles } = useDocxMerger()

  const totalSize = useMemo(() => getTotalSize(items), [items])

  const handleSelectFiles = (fileList: FileList | null) => {
    if (!fileList?.length) {
      return
    }

    const files = Array.from(fileList)
    const invalid = files.find((file) => !isSupportedDocx(file))
    if (invalid) {
      setNotice({ tone: 'error', title: t('unsupportedFile'), message: t('docxOnlyAccepted') })
      return
    }

    setItems(files.map((file) => createDocumentItem(file, 'docx')))
    setNotice({ tone: 'success', title: t('documentsAdded'), message: t('docxListUpdated') })
  }

  const handleMerge = async () => {
    if (items.length < 2) {
      setNotice({ tone: 'error', title: t('documentsRequired'), message: t('docxNeedAtLeastTwo') })
      return
    }

    const merged = await mergeDocxFiles(items.map((item) => item.file))
    if (merged) {
      setNotice({ tone: 'success', title: t('docxMergeCompleted'), message: t('docxReadyToDownload') })
    }
  }

  return (
    <>
      <SectionHero
        badge={`${t('document')} / ${t('mergeWord')}`}
        title={t('docxMergeTitle')}
        description={t('docxMergeDesc')}
        aside={
          <div className="rounded-[1.5rem] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{t('currentScope')}</p>
            <div className="mt-4 space-y-2 text-sm text-slate-200">
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('input')}: DOCX</div>
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('output')}: DOCX</div>
            </div>
          </div>
        }
      />

      <div className="grid gap-6 min-[1700px]:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel p-6 sm:p-8">
          <BetaNotice message={t('betaWordMessage')} />

          <FileDropzone
            title={t('docxMergeCardTitle')}
            description={t('docxMergeCardDesc')}
            buttonLabel={t('selectDocx')}
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            multiple
            disabled={isProcessing}
            aside={<span className="badge">DOCX</span>}
            onSelect={(files) => handleSelectFiles(files)}
          />

          {error ? <div className="mt-6"><AlertBanner tone="error" title={t('docxMergeError')} message={error} /></div> : null}
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
              <p className="mt-2 text-sm font-semibold text-slate-900">DOCX</p>
            </div>
          </div>

          <div className="mt-6">
            {items.length > 0 ? (
              <DocumentQueue
                items={items}
                emptyMessage={t('emptyDocxQueue')}
                onMoveUp={(index) => setItems((current) => moveDocument(current, index, index - 1))}
                onMoveDown={(index) => setItems((current) => moveDocument(current, index, index + 1))}
                onRemove={(id) => setItems((current) => current.filter((item) => item.id !== id))}
                disabled={isProcessing}
              />
            ) : (
              <EmptyState badge={t('noDocuments')} title={t('emptyDocxTitle')} description={t('emptyDocxDesc')} />
            )}
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-2 xl:flex xl:flex-wrap">
            <button type="button" className="btn-primary w-full sm:w-auto" onClick={handleMerge} disabled={isProcessing || items.length < 2}>
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                <path d="M7 7h10" />
                <path d="M7 12h10" />
                <path d="M7 17h10" />
                <path d="m12 4 3 3-3 3" />
              </svg>
              {isProcessing ? t('mergingDocuments') : t('mergeDocxBtn')}
            </button>
            {items.length > 0 ? (
              <button
                type="button"
                className="btn-secondary w-full sm:w-auto"
                onClick={() => {
                  setItems([])
                  setNotice({ tone: 'info', title: t('documentLocalProcessing'), message: t('docxListCleared') })
                }}
                disabled={isProcessing}
              >
                {t('clearList')}
              </button>
            ) : null}
            {result ? (
              <button type="button" className="btn-download w-full sm:w-auto" onClick={() => downloadFromUrl(result.url, result.fileName)}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                  <path d="M12 4v10" />
                  <path d="m8 10 4 4 4-4" />
                  <path d="M5 19h14" />
                </svg>
                {t('downloadMergedDocx')}
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
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">{t('docxMergeHint')}</div>
          </div>
        </section>
      </div>
    </>
  )
}
