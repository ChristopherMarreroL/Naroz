import { useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { BetaNotice } from '../../components/shared/BetaNotice'
import { EmptyState } from '../../components/shared/EmptyState'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { SectionHero } from '../../components/shared/SectionHero'
import { useToastNotice } from '../../hooks/useToastNotice'
import { useLocale } from '../../i18n/LocaleProvider'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import {
  exportMarkdownToDocx,
  exportMarkdownToPdf,
  getMarkdownBaseName,
  getMarkdownStats,
  isSupportedMarkdown,
  MARKDOWN_MAX_SIZE,
  markdownToSafeHtml,
} from './lib/markdownExport'

type OutputFormat = 'pdf' | 'docx'

export function MarkdownConverterView() {
  const { t } = useLocale()
  const [file, setFile] = useState<File | null>(null)
  const [source, setSource] = useState('')
  const [previewHtml, setPreviewHtml] = useState('')
  const [outputFormat, setOutputFormat] = useState<OutputFormat>('pdf')
  const [isConverting, setIsConverting] = useState(false)
  const [notice, setNotice] = useToastNotice<{ tone: 'info' | 'success' | 'error' | 'warning'; title: string; message: string } | null>({
    tone: 'info',
    title: t('markdownLocalTitle'),
    message: t('markdownLocalMessage'),
  })

  const stats = useMemo(() => getMarkdownStats(source), [source])

  const clearContent = () => {
    setFile(null)
    setSource('')
    setPreviewHtml('')
    setOutputFormat('pdf')
    setNotice({ tone: 'info', title: t('contentCleared'), message: t('markdownLocalMessage') })
  }

  const handleSelectFiles = async (fileList: FileList | null) => {
    const selectedFile = fileList?.[0]
    if (!selectedFile) {
      return
    }

    if (!isSupportedMarkdown(selectedFile)) {
      setNotice({ tone: 'error', title: t('markdownInvalidTitle'), message: t('markdownInvalidMessage') })
      return
    }

    try {
      const nextSource = await selectedFile.text()
      if (!nextSource.trim()) {
        setNotice({ tone: 'warning', title: t('markdownEmptyTitle'), message: t('markdownEmptyMessage') })
        return
      }

      setFile(selectedFile)
      setSource(nextSource)
      setPreviewHtml(markdownToSafeHtml(nextSource))
      setNotice({ tone: 'success', title: t('markdownLoadedTitle'), message: t('markdownLoadedMessage') })
    } catch {
      setNotice({ tone: 'error', title: t('markdownReadErrorTitle'), message: t('markdownReadErrorMessage') })
    }
  }

  const handleConvert = async () => {
    if (!file || !previewHtml) {
      setNotice({ tone: 'error', title: t('markdownMissingTitle'), message: t('markdownMissingMessage') })
      return
    }

    setIsConverting(true)
    try {
      const baseName = getMarkdownBaseName(file.name)
      const blob = outputFormat === 'pdf'
        ? await exportMarkdownToPdf(previewHtml, baseName)
        : await exportMarkdownToDocx(previewHtml, baseName)
      const url = URL.createObjectURL(blob)
      downloadFromUrl(url, baseName + '.' + outputFormat)
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice({
        tone: 'success',
        title: t('markdownConvertedTitle'),
        message: outputFormat === 'pdf' ? t('markdownPdfReadyMessage') : t('markdownDocxReadyMessage'),
      })
    } catch (error) {
      setNotice({
        tone: 'error',
        title: t('markdownConvertErrorTitle'),
        message: error instanceof Error ? error.message : t('markdownConvertErrorMessage'),
      })
    } finally {
      setIsConverting(false)
    }
  }

  return (
    <>
      <SectionHero
        badge={t('markdownBadge')}
        title={t('markdownTitle')}
        description={t('markdownDescription')}
        aside={
          <div className="rounded-[1.5rem] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{t('markdownFlowTitle')}</p>
            <div className="mt-4 grid gap-2 text-sm text-slate-200">
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('input')}: Markdown (.md)</div>
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('output')}: PDF / DOCX</div>
              <div className="rounded-2xl bg-emerald-400/12 px-4 py-3 text-emerald-100">{t('markdownLocalBadge')}</div>
            </div>
          </div>
        }
      />

      <div className="grid gap-6 min-[1700px]:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel min-w-0 p-6 sm:p-8">
          <BetaNotice />
          <div className="mt-6">
            <FileDropzone
            title={t('markdownUploadTitle')}
            description={t('markdownUploadDescription')}
            uploadLabel={t('markdownUploadLabel')}
            acceptedFormats="MD / MARKDOWN"
            accept=".md,.markdown,text/markdown,text/plain"
            maxSize={MARKDOWN_MAX_SIZE}
            aside={<span className="badge">MD</span>}
            onSelect={(files) => void handleSelectFiles(files)}
          />
          </div>

          {notice ? <div className="mt-6"><AlertBanner tone={notice.tone} title={notice.title} message={notice.message} /></div> : null}

          {file ? (
            <div className="mt-6 grid gap-6">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <div className="panel-subtle min-w-0 p-4 sm:col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('name')}</p>
                  <p className="mt-2 truncate text-sm font-semibold text-slate-900" title={file.name}>{file.name}</p>
                  <p className="mt-2 text-xs text-slate-500">{formatBytes(file.size)}</p>
                </div>
                <div className="panel-subtle p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('markdownWords')}</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{stats.words}</p>
                </div>
                <div className="panel-subtle p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('markdownLines')}</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{stats.lines}</p>
                </div>
                <div className="panel-subtle p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('markdownHeadings')}</p>
                  <p className="mt-2 text-lg font-bold text-slate-900">{stats.headings}</p>
                </div>
              </div>

              <div className="panel-subtle p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{t('markdownOutputTitle')}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-500">{t('markdownOutputDescription')}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('markdownOutputTitle')}>
                    {(['pdf', 'docx'] as const).map((format) => (
                      <button
                        key={format}
                        type="button"
                        className={outputFormat === format ? 'btn-primary min-w-24' : 'btn-secondary min-w-24'}
                        aria-pressed={outputFormat === format}
                        onClick={() => setOutputFormat(format)}
                      >
                        {format.toUpperCase()}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="panel-subtle min-w-0 overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{t('markdownPreviewTitle')}</p>
                    <p className="mt-1 text-xs text-slate-500">{t('markdownPreviewDescription')}</p>
                  </div>
                  <span className="badge">{stats.characters} {t('markdownCharacters')}</span>
                </div>
                <article className="markdown-preview" dangerouslySetInnerHTML={{ __html: previewHtml }} />
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn-download" disabled={isConverting} onClick={() => void handleConvert()}>
                  {isConverting ? t('markdownConverting') : outputFormat === 'pdf' ? t('markdownDownloadPdf') : t('markdownDownloadDocx')}
                </button>
                <button type="button" className="btn-secondary" disabled={isConverting} onClick={clearContent}>
                  {t('clearContent')}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState badge="MD" title={t('markdownEmptyStateTitle')} description={t('markdownEmptyStateDescription')} />
            </div>
          )}
        </section>

        <aside className="panel h-fit p-6 min-[1700px]:sticky min-[1700px]:top-6">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('processingStatusTitle')}</p>
          <h2 className="mt-3 text-xl font-bold text-slate-950">{t('markdownStatusTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">{t('markdownStatusDescription')}</p>
          <div className="mt-5 grid gap-3">
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('filesLoaded')}</p>
              <p className="mt-2 text-lg font-bold text-slate-900">{file ? 1 : 0}</p>
            </div>
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{t('targetOutput')}</p>
              <p className="mt-2 text-lg font-bold text-slate-900">{outputFormat.toUpperCase()}</p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-800">
              {t('markdownImagesNotice')}
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
