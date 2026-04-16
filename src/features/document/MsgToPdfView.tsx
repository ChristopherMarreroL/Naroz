import { useEffect, useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { BetaNotice } from '../../components/shared/BetaNotice'
import { EmptyState } from '../../components/shared/EmptyState'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { formatBytes } from '../../lib/format'
import { createDocumentItem, isSupportedEml, isSupportedMailFile, type DocumentItem } from './lib/files'
import { parseMailFile, type ParsedMsgData } from './lib/msgToPdf'

function sanitizeHtmlForExport(html: string) {
  return html.replace(/oklch\([^)]*\)/gi, '#1f2937')
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildPrintableMailDocument(title: string, sender: string, sentAt: string, html: string, textFallback: string) {
  const body = html || `<pre style="white-space:pre-wrap;font:14px/1.7 Arial,sans-serif;color:#1f2937;">${escapeHtml(textFallback)}</pre>`
  const safeTitle = escapeHtml(title)
  const safeSender = escapeHtml(sender)
  const safeDate = escapeHtml(sentAt)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      body { margin: 0; background: #fff; color: #1f2937; font: 14px/1.7 Arial, sans-serif; }
      .page { max-width: 920px; margin: 0 auto; padding: 32px; }
      h1 { font-size: 30px; line-height: 1.3; margin: 0 0 24px; color: #0f172a; }
      .meta { border-bottom: 1px solid #cbd5e1; padding-bottom: 16px; margin-bottom: 20px; color: #475569; }
      .meta p { margin: 0 0 8px; }
      .mail-html, .mail-html * { max-width: 100%; word-break: break-word; }
      .mail-html img { height: auto; }
      .mail-html table { width: 100%; border-collapse: collapse; display: block; overflow-x: auto; }
      .mail-html td, .mail-html th { padding: 6px 8px; vertical-align: top; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .page { padding: 18px; } }
    </style>
  </head>
  <body>
    <div class="page">
      <h1>${safeTitle}</h1>
      <div class="meta">
        <p><strong>From:</strong> ${safeSender}</p>
        <p><strong>Date:</strong> ${safeDate}</p>
      </div>
      <div class="mail-html">${body}</div>
    </div>
    <script>
      window.onload = () => {
        window.focus();
        setTimeout(() => window.print(), 350);
      };
    </script>
  </body>
</html>`
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function inlineRemoteImages(html: string) {
  if (!html.trim() || typeof DOMParser === 'undefined') {
    return html
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const images = Array.from(doc.querySelectorAll('img'))

  await Promise.all(
    images.map(async (image) => {
      const src = image.getAttribute('src')?.trim()
      if (!src || src.startsWith('data:') || src.startsWith('blob:') || src.startsWith('cid:')) {
        return
      }

      try {
        const response = await fetch(src)
        if (!response.ok) {
          return
        }

        const blob = await response.blob()
        const dataUrl = await blobToDataUrl(blob)
        if (dataUrl) {
          image.setAttribute('src', dataUrl)
        }
      } catch {
        // If the host blocks access, keep the original URL.
      }
    }),
  )

  return doc.body.innerHTML
}

export function MsgToPdfView() {
  const { t } = useLocale()
  const [item, setItem] = useState<DocumentItem | null>(null)
  const [parsed, setParsed] = useState<ParsedMsgData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [renderHtml, setRenderHtml] = useState('')
  const [notice, setNotice] = useState<{ tone: 'info' | 'success' | 'error'; title: string; message: string } | null>({
    tone: 'info',
    title: t('documentLocalProcessing'),
    message: t('msgToPdfCardDesc'),
  })

  const recipientCount = useMemo(() => parsed?.recipients.length ?? 0, [parsed])
  const senderSummary = useMemo(() => parsed?.senderName || parsed?.senderEmail || '-', [parsed?.senderEmail, parsed?.senderName])
  const senderDisplay = useMemo(() => parsed?.senderEmail || parsed?.senderName || '-', [parsed?.senderEmail, parsed?.senderName])

  useEffect(() => {
    let cancelled = false

    if (!parsed?.bodyHtml) {
      return undefined
    }

    void inlineRemoteImages(sanitizeHtmlForExport(parsed.bodyHtml)).then((html) => {
      if (!cancelled) {
        setRenderHtml(html)
      }
    })

    return () => {
      cancelled = true
    }
  }, [parsed?.bodyHtml])

  const clearAll = () => {
    setItem(null)
    setParsed(null)
    setError(null)
    setRenderHtml('')
    setNotice({ tone: 'info', title: t('contentCleared'), message: t('msgToPdfCardDesc') })
  }

  const handleSelectFiles = async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) {
      return
    }

    setError(null)

    if (!isSupportedMailFile(file)) {
      setNotice({ tone: 'error', title: t('unsupportedFile'), message: t('mailOnlyAccepted') })
      return
    }

    try {
      const nextParsed = await parseMailFile(file)
      setItem(createDocumentItem(file, isSupportedEml(file) ? 'eml' : 'msg'))
      setParsed(nextParsed)
      setError(null)
      setRenderHtml('')
      setNotice({ tone: 'success', title: t('documentsAdded'), message: t('mailLoaded') })
    } catch (msgError) {
      setItem(createDocumentItem(file, isSupportedEml(file) ? 'eml' : 'msg'))
      setParsed(null)
      setError(msgError instanceof Error ? msgError.message : t('mailToPdfUnsupported'))
      setNotice(null)
    }
  }

  const handlePrintFallback = () => {
    if (!parsed) {
      return
    }

    const printWindow = window.open('', '_blank', 'width=1100,height=900')
    if (!printWindow) {
      setError(t('mailPrintPopupBlocked'))
      return
    }

    const printableHtml = buildPrintableMailDocument(
      parsed.subject || '-',
      senderSummary,
      parsed.sentAt || '-',
      renderHtml,
      parsed.body || t('emptyMsgBody'),
    )

    const blob = new Blob([printableHtml], { type: 'text/html;charset=utf-8' })
    const blobUrl = URL.createObjectURL(blob)
    printWindow.location.replace(blobUrl)
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
  }

  return (
    <>
      <SectionHero
        badge={t('mailToPdfBadge')}
        title={t('mailToPdfTitle')}
        description={t('mailToPdfDesc')}
        aside={
          <div className="rounded-[1.5rem] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{t('currentScope')}</p>
            <div className="mt-4 space-y-2 text-sm text-slate-200">
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('input')}: MSG / EML</div>
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('output')}: PDF</div>
            </div>
          </div>
        }
      />

      <div className="grid gap-6 min-[1700px]:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel p-6 sm:p-8">
          <BetaNotice message={t('mailToPdfBetaMessage')} />

          <div className="mt-6">
            <FileDropzone
              title={t('mailToPdfCardTitle')}
              description={t('mailToPdfCardDesc')}
              buttonLabel={t('selectMail')}
              accept=".msg,.eml,application/vnd.ms-outlook,message/rfc822"
              aside={<span className="badge">MSG / EML</span>}
              onSelect={(files) => void handleSelectFiles(files)}
            />
          </div>

          {error ? <div className="mt-6"><AlertBanner tone="error" title={t('mailToPdfError')} message={error} /></div> : null}
          {notice ? <div className="mt-6"><AlertBanner tone={notice.tone} title={notice.title} message={notice.message} /></div> : null}

          {item && parsed ? (
            <div className="mt-6 grid gap-5 2xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="panel-subtle p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('name')}</p>
                <p className="mt-2 break-words text-sm font-semibold text-slate-900">{item.name}</p>
                <p className="mt-3 text-xs text-slate-500">{item.extension.toUpperCase()} · {formatBytes(item.size)}</p>
              </div>

              <div className="grid gap-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('subject')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{parsed.subject || '-'}</p></div>
                  <div className="panel-subtle min-w-0 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('fromLabel')}</p><p className="mt-2 truncate text-sm font-semibold text-slate-900" title={senderDisplay}>{senderDisplay}</p></div>
                  <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('recipients')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{recipientCount}</p></div>
                  <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('attachments')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{parsed.attachments.length}</p></div>
                </div>

                <div className="panel-subtle p-5 sm:p-6">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <p className="font-semibold text-slate-900">{t('msgPreview')}</p>
                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
                      <h3 className="text-lg font-bold text-slate-950">{parsed.subject || '-'}</h3>
                      <div className="mt-4 space-y-2 border-b border-slate-200 pb-4 text-sm leading-6 text-slate-600">
                        <p><span className="font-semibold text-slate-900">{t('fromLabel')}:</span> {senderSummary}</p>
                        <p><span className="font-semibold text-slate-900">{t('date')}:</span> {parsed.sentAt || '-'}</p>
                      </div>

                      {renderHtml ? (
                        <div className="msg-preview-html mt-5 overflow-hidden break-words leading-7 text-slate-800" dangerouslySetInnerHTML={{ __html: renderHtml }} />
                      ) : (
                        <div className="mt-5 whitespace-pre-wrap break-words leading-7 text-slate-800">{parsed.body || t('emptyMsgBody')}</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button type="button" className="btn-secondary w-full sm:w-auto" onClick={clearAll}>{t('clearContent')}</button>
                    <button type="button" className="btn-download w-full sm:w-auto" onClick={handlePrintFallback} disabled={!renderHtml && !parsed.body}>
                      {t('printMailPdf')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6"><EmptyState badge={t('noDocuments')} title={t('emptyMsgTitle')} description={t('emptyMsgDesc')} /></div>
          )}
        </section>

        <section className="panel p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold text-slate-950">{t('documentStatusTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('mailToPdfStatusDesc')}</p>

          <div className="mt-6 grid gap-4">
            <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('output')}</p><p className="mt-2 text-sm font-semibold text-slate-900">PDF</p></div>
            {parsed ? <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('bodyLength')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{parsed.body.length}</p></div> : null}
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">{t('mailToPdfHint')}</div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-700">{t('mailImageFallbackHint')}</div>
          </div>
        </section>
      </div>

    </>
  )
}
