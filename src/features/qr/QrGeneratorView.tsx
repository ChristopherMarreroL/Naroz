import { useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { useToastNotice } from '../../hooks/useToastNotice'
import { downloadFromUrl } from '../../lib/download'
import { QrOptionsPanel } from './components/QrOptionsPanel'
import { QrPreview } from './components/QrPreview'
import { useQrGenerator } from './hooks/useQrGenerator'
import { normalizeLogoSizePercent, normalizeQrSize, type QrRenderOptions } from './utils/qrUtils'

const DEFAULT_QR_OPTIONS = {
  foregroundColor: '#000000',
  backgroundColor: '#ffffff',
  size: 512,
  logoSizePercent: 20,
  logoBackgroundEnabled: true,
}

const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024
const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
const LOGO_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.svg']

type NoticeTone = 'error' | 'warning' | 'success' | 'info'

interface LogoFileState {
  name: string
  dataUrl: string
}

function isSupportedLogoFile(file: File) {
  const lowerName = file.name.toLowerCase()

  return LOGO_TYPES.has(file.type) || LOGO_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }

      reject(new Error('INVALID_LOGO_FILE'))
    }
    reader.onerror = () => reject(new Error('INVALID_LOGO_FILE'))
    reader.readAsDataURL(file)
  })
}

function validateLogoDataUrl(dataUrl: string) {
  return new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('INVALID_LOGO_FILE'))
    image.src = dataUrl
  })
}

export function QrGeneratorView() {
  const { t } = useLocale()
  const [content, setContent] = useState('')
  const [foregroundColor, setForegroundColor] = useState(DEFAULT_QR_OPTIONS.foregroundColor)
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_QR_OPTIONS.backgroundColor)
  const [size, setSize] = useState(DEFAULT_QR_OPTIONS.size)
  const [logo, setLogo] = useState<LogoFileState | null>(null)
  const [logoSizePercent, setLogoSizePercent] = useState(DEFAULT_QR_OPTIONS.logoSizePercent)
  const [logoBackgroundEnabled, setLogoBackgroundEnabled] = useState(DEFAULT_QR_OPTIONS.logoBackgroundEnabled)
  const [notice, setNotice] = useToastNotice<{ tone: NoticeTone; title: string; message: string } | null>({
    tone: 'info',
    title: t('qrInitialNoticeTitle'),
    message: t('qrInitialNoticeMessage'),
  })
  const { result, isGenerating, error, generate, clear } = useQrGenerator()

  const currentOptions: QrRenderOptions = {
    foregroundColor,
    backgroundColor,
    size,
    logo: logo
      ? {
          dataUrl: logo.dataUrl,
          sizePercent: logoSizePercent,
          backgroundEnabled: logoBackgroundEnabled,
        }
      : undefined,
  }


  const handleLogoSelect = async (file: File | null) => {
    if (!file) {
      return
    }

    if (!isSupportedLogoFile(file)) {
      setNotice({ tone: 'error', title: t('qrLogoInvalidTitle'), message: t('qrLogoInvalidType') })
      return
    }

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setNotice({ tone: 'error', title: t('qrLogoInvalidTitle'), message: t('qrLogoTooLarge') })
      return
    }

    try {
      const dataUrl = await readFileAsDataUrl(file)
      await validateLogoDataUrl(dataUrl)
      setLogo({ name: file.name, dataUrl })
      clear()
      setNotice({ tone: 'success', title: t('qrLogoLoadedTitle'), message: t('qrLogoLoadedMessage') })
    } catch {
      setNotice({ tone: 'error', title: t('qrLogoInvalidTitle'), message: t('qrLogoLoadError') })
    }
  }

  const handleRemoveLogo = () => {
    setLogo(null)
    setLogoSizePercent(DEFAULT_QR_OPTIONS.logoSizePercent)
    setLogoBackgroundEnabled(DEFAULT_QR_OPTIONS.logoBackgroundEnabled)
    clear()
    setNotice({ tone: 'info', title: t('qrLogoRemovedTitle'), message: t('qrLogoRemovedMessage') })
  }

  const handleGenerate = async () => {
    const normalizedContent = content.trim()

    if (!normalizedContent) {
      setNotice({ tone: 'error', title: t('qrEmptyTitle'), message: t('qrEmptyMessage') })
      return
    }

    const generated = await generate(normalizedContent, {
      ...currentOptions,
      size: normalizeQrSize(size),
      logo: logo
        ? {
            dataUrl: logo.dataUrl,
            sizePercent: normalizeLogoSizePercent(logoSizePercent),
            backgroundEnabled: logoBackgroundEnabled,
          }
        : undefined,
    })

    if (generated) {
      setNotice({ tone: 'success', title: t('qrGeneratedTitle'), message: logo ? t('qrGeneratedWithLogoMessage') : t('qrGeneratedMessage') })
    } else {
      setNotice({ tone: 'error', title: t('qrGenerationErrorTitle'), message: error ?? t('qrGenerationErrorMessage') })
    }
  }

  const handleReset = () => {
    setForegroundColor(DEFAULT_QR_OPTIONS.foregroundColor)
    setBackgroundColor(DEFAULT_QR_OPTIONS.backgroundColor)
    setSize(DEFAULT_QR_OPTIONS.size)
    setLogoSizePercent(DEFAULT_QR_OPTIONS.logoSizePercent)
    setLogoBackgroundEnabled(DEFAULT_QR_OPTIONS.logoBackgroundEnabled)
    clear()
    setNotice({ tone: 'info', title: t('qrResetTitle'), message: t('qrResetMessage') })
  }

  const handleDownloadPng = () => {
    if (!result) {
      setNotice({ tone: 'error', title: t('qrDownloadErrorTitle'), message: t('qrDownloadMissingMessage') })
      return
    }

    try {
      downloadFromUrl(result.pngDataUrl, 'naroz-qr-code.png')
      setNotice({ tone: 'success', title: t('qrDownloadReadyTitle'), message: t('qrPngDownloadMessage') })
    } catch (downloadError) {
      setNotice({ tone: 'error', title: t('qrDownloadErrorTitle'), message: downloadError instanceof Error ? downloadError.message : t('qrDownloadErrorMessage') })
    }
  }

  return (
    <>
      <SectionHero
        badge={t('qrGeneratorBadge')}
        title={t('qrGeneratorTitle')}
        description={t('qrGeneratorDesc')}
        aside={
          <div className="rounded-[1.5rem] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{t('currentScope')}</p>
            <div className="mt-4 space-y-2 text-sm text-slate-200">
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('qrScopeLine1')}</div>
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('qrScopeLine2')}</div>
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('qrScopeLine3')}</div>
            </div>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="panel p-4 sm:p-6 lg:p-8">
          <div className="grid gap-6 2xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.75fr)]">
            <div className="grid gap-6">
              {notice ? <AlertBanner tone={notice.tone} title={notice.title} message={notice.message} /> : null}

              <div className="panel-subtle p-4 sm:p-6">
                <h2 className="text-2xl font-extrabold text-slate-950">{t('qrFormTitle')}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{t('qrFormDesc')}</p>

                <div className="mt-6">
                  <QrOptionsPanel
                    content={content}
                    foregroundColor={foregroundColor}
                    backgroundColor={backgroundColor}
                    size={size}
                    logoName={logo?.name ?? null}
                    logoPreviewUrl={logo?.dataUrl ?? null}
                    logoSizePercent={logoSizePercent}
                    logoBackgroundEnabled={logoBackgroundEnabled}
                    disabled={isGenerating}
                    onContentChange={setContent}
                    onForegroundColorChange={setForegroundColor}
                    onBackgroundColorChange={setBackgroundColor}
                    onSizeChange={setSize}
                    onLogoSelect={handleLogoSelect}
                    onLogoSizePercentChange={setLogoSizePercent}
                    onLogoBackgroundEnabledChange={setLogoBackgroundEnabled}
                    onRemoveLogo={handleRemoveLogo}
                  />
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                  <button type="button" className="btn-primary w-full sm:w-auto" onClick={handleGenerate} disabled={isGenerating}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                      <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4z" />
                      <path d="M14 14h2v2h-2zM18 14h2v6h-4v-2h2zM14 18h2v2h-2z" />
                    </svg>
                    {isGenerating ? t('qrGenerating') : t('qrGenerateBtn')}
                  </button>
                  <button type="button" className="btn-secondary w-full sm:w-auto" onClick={handleReset} disabled={isGenerating}>
                    {t('resetChanges')}
                  </button>
                  {result ? (
                    <button type="button" className="btn-download w-full sm:w-auto" onClick={handleDownloadPng}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                        <path d="M12 4v10" />
                        <path d="m8 10 4 4 4-4" />
                        <path d="M5 19h14" />
                      </svg>
                      {t('qrDownloadPng')}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <QrPreview pngDataUrl={result?.pngDataUrl ?? null} size={size} />
          </div>
        </section>

        <section className="panel p-4 sm:p-6 lg:p-8">
          <h2 className="text-2xl font-extrabold text-slate-950">{t('qrStatusTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('qrStatusDesc')}</p>

          <div className="mt-6 grid gap-4">
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('input')}</p>
              <p className="mt-2 break-words text-sm font-semibold text-slate-900">{content.trim() ? t('enabled') : t('waitingFile')}</p>
            </div>
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('targetOutput')}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">PNG</p>
            </div>
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('size')}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{size}px</p>
            </div>
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('qrLogoStatus')}</p>
              <p className="mt-2 break-words text-sm font-semibold text-slate-900">{logo ? `${logo.name} - ${logoSizePercent}%` : t('qrNoLogo')}</p>
            </div>
            {result ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">{t('outputReady')}</p>
                <p className="mt-2 text-sm leading-6 text-emerald-700">{t('qrReadyToDownload')}</p>
              </div>
            ) : null}
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-700">{t('qrLocalHint')}</div>
          </div>
        </section>
      </div>
    </>
  )
}
