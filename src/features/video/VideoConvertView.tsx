import { useEffect, useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { EmptyState } from '../../components/shared/EmptyState'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes, formatDuration, formatResolution } from '../../lib/format'
import type { VideoOutputFormat } from '../../types/video'
import { useVideoConverter } from './hooks/useVideoConverter'
import { createVideoItem, isSupportedVideo } from './lib/media'

export function VideoConvertView() {
  const { locale, t } = useLocale()
  const [video, setVideo] = useState<Awaited<ReturnType<typeof createVideoItem>> | null>(null)
  const [outputFormat, setOutputFormat] = useState<VideoOutputFormat>('mp4')
  const [notice, setNotice] = useState<{ tone: 'info' | 'success' | 'error'; title: string; message: string } | null>({
    tone: 'info',
    title: t('localConversion'),
    message: locale === 'es' ? 'Selecciona un archivo MP4 o MKV y Naroz lo convertira al formato final elegido.' : 'Choose one MP4 or MKV file and Naroz will convert it to the selected output format.',
  })
  const { progress, isProcessing, result, error, ensureLoaded, convertVideo } = useVideoConverter()

  useEffect(() => {
    return () => {
      if (video?.previewUrl) {
        URL.revokeObjectURL(video.previewUrl)
      }
    }
  }, [video])

  useEffect(() => {
    void ensureLoaded()
  }, [ensureLoaded])

  const outputInfo = useMemo(() => outputFormat.toUpperCase(), [outputFormat])

  const handleSelectFile = async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) {
      return
    }

    if (!isSupportedVideo(file)) {
      setNotice({ tone: 'error', title: t('unsupportedFile'), message: locale === 'es' ? 'Esta herramienta actualmente acepta solo MP4 y MKV.' : 'This tool currently accepts MP4 and MKV only.' })
      return
    }

    const item = await createVideoItem(file)
    setVideo((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl)
      }

      return item
    })
    setNotice({ tone: 'success', title: t('videoLoaded'), message: locale === 'es' ? 'Ya puedes elegir el formato final y comenzar la conversion.' : 'You can now choose the output format and start the conversion.' })
  }

  const handleConvert = async () => {
    if (!video) {
      setNotice({ tone: 'error', title: locale === 'es' ? 'Falta un video' : 'Missing video', message: locale === 'es' ? 'Selecciona un video antes de convertir.' : 'Select a video before converting.' })
      return
    }

    const converted = await convertVideo(video.file, outputFormat)
    if (converted) {
      setNotice({ tone: 'success', title: t('conversionCompleted'), message: locale === 'es' ? `Tu archivo ${converted.outputFormat.toUpperCase()} ya esta listo para descargar.` : `Your ${converted.outputFormat.toUpperCase()} file is ready to download.` })
    }
  }

  return (
    <>
      <SectionHero
        badge={locale === 'es' ? 'Video / Convertir formato' : 'Video / Convert format'}
        title={t('convertVideoTitle')}
        description={t('convertVideoDesc')}
        aside={
          <div className="rounded-[1.5rem] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{t('currentScope')}</p>
            <div className="mt-4 space-y-2 text-sm text-slate-200">
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('input')}: MP4 {locale === 'es' ? 'o' : 'or'} MKV</div>
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('output')}: MP4 {locale === 'es' ? 'o' : 'or'} MKV</div>
            </div>
          </div>
        }
      />

      <div className="grid gap-6 min-[1700px]:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel p-6 sm:p-8">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-950">{t('convertVideoCardTitle')}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{t('convertVideoCardDesc')}</p>
            </div>

            <label className="btn-primary w-full cursor-pointer justify-center sm:w-auto">
              {t('selectVideo')}
              <input
                type="file"
                accept="video/mp4,.mp4,video/x-matroska,.mkv"
                className="hidden"
                onChange={(event) => void handleSelectFile(event.target.files)}
              />
            </label>
          </div>

          {error ? <div className="mt-6"><AlertBanner tone="error" title={t('conversionError')} message={error} /></div> : null}
          {notice ? <div className="mt-6"><AlertBanner tone={notice.tone} title={notice.title} message={notice.message} /></div> : null}

          {video ? (
            <div className="mt-6 grid gap-5 2xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="panel-subtle overflow-hidden p-3">
                <div className="overflow-hidden rounded-[1.2rem] bg-slate-100">
                  <video src={video.previewUrl} className="aspect-video h-full w-full object-cover" controls preload="metadata" />
                </div>
              </div>

              <div className="grid gap-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('name')}</p>
                    <p className="mt-2 break-words text-sm font-semibold text-slate-900">{video.name}</p>
                  </div>
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('size')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{formatBytes(video.size)}</p>
                  </div>
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('format')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{video.extension.toUpperCase()}</p>
                  </div>
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('resolution')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{formatResolution(video.width, video.height)}</p>
                  </div>
                </div>

                <div className="panel-subtle p-5 sm:p-6">
                  <label htmlFor="convert-output-format" className="text-sm font-semibold text-slate-900">{t('outputFormat')}</label>
                  <select
                    id="convert-output-format"
                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                    value={outputFormat}
                    onChange={(event) => setOutputFormat(event.target.value as VideoOutputFormat)}
                    disabled={isProcessing}
                  >
                    <option value="mp4">MP4</option>
                    <option value="mkv">MKV</option>
                  </select>

                  <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:flex xl:flex-wrap">
                    <button type="button" className="btn-primary w-full sm:w-auto" onClick={handleConvert} disabled={isProcessing}>
                      {isProcessing ? t('converting') : t('convertVideoBtn')}
                    </button>
                    {result ? (
                      <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => downloadFromUrl(result.url, result.fileName)}>
                        {t('downloadConvertedVideo')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState
                badge={t('noVideoSelected')}
                title={t('emptyConvertVideoTitle')}
                description={locale === 'es' ? 'Naroz actualmente puede convertir un solo video MP4 o MKV a la vez hacia salida MP4 o MKV.' : 'Naroz can currently convert one MP4 or MKV video at a time into MP4 or MKV output.'}
              />
            </div>
          )}
        </section>

        <section className="panel p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold text-slate-950">{t('conversionStatus')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('conversionStatusDesc')}</p>

          <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-slate-950 transition-all duration-300" style={{ width: `${progress.percent}%` }} />
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <span>{progress.stage}</span>
            <span>{progress.percent}%</span>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('targetOutput')}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{outputInfo}</p>
            </div>
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('progressDetail')}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{progress.detail ?? t('waitingFile')}</p>
            </div>
            {result ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">{t('convertedFileReady')}</p>
                <p className="mt-2 text-sm leading-6 text-emerald-700">{result.fileName} · {formatBytes(result.size)}</p>
              </div>
            ) : null}
            {video ? (
              <div className="panel-subtle p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('duration')}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{formatDuration(video.duration)}</p>
              </div>
            ) : null}
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-700">
              {t('stableFocus')}
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
