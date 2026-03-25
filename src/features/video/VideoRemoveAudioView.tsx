import { useEffect, useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { EmptyState } from '../../components/shared/EmptyState'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes, formatDuration, formatResolution } from '../../lib/format'
import { createVideoItem, isSupportedVideo } from './lib/media'
import { useVideoAudioRemover } from './hooks/useVideoAudioRemover'

export function VideoRemoveAudioView() {
  const { t } = useLocale()
  const [video, setVideo] = useState<Awaited<ReturnType<typeof createVideoItem>> | null>(null)
  const [notice, setNotice] = useState<{ tone: 'info' | 'success' | 'error'; title: string; message: string } | null>({
    tone: 'info',
    title: t('localConversion'),
    message: t('removeAudioCardDesc'),
  })
  const { progress, isProcessing, result, error, ensureLoaded, removeAudio } = useVideoAudioRemover()

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

  const outputInfo = useMemo(() => video?.extension.toUpperCase() ?? '--', [video])

  const clearAll = () => {
    setVideo((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl)
      }

      return null
    })
    setNotice({ tone: 'info', title: t('contentCleared'), message: t('removeAudioCardDesc') })
  }

  const handleSelectFile = async (fileList: FileList | null) => {
    const file = fileList?.[0]
    if (!file) {
      return
    }

    if (!isSupportedVideo(file)) {
      setNotice({ tone: 'error', title: t('unsupportedFile'), message: t('videoOnlyAccepted') })
      return
    }

    const item = await createVideoItem(file)
    setVideo((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl)
      }

      return item
    })
    setNotice({ tone: 'success', title: t('videoLoaded'), message: t('videoWithoutAudioReady') })
  }

  const handleRemoveAudio = async () => {
    if (!video) {
      setNotice({ tone: 'error', title: t('missingVideo'), message: t('selectVideoBeforeRemoveAudio') })
      return
    }

    const muted = await removeAudio(video.file)
    if (muted) {
      setNotice({ tone: 'success', title: t('removeAudioCompleted'), message: t('removeAudioCompletedMessage') })
    }
  }

  return (
    <>
      <SectionHero
        badge={t('removeAudioBadge')}
        title={t('removeAudioTitle')}
        description={t('removeAudioDesc')}
        aside={
          <div className="rounded-[1.5rem] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{t('currentScope')}</p>
            <div className="mt-4 space-y-2 text-sm text-slate-200">
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('input')}: MP4 {t('orWord')} MKV</div>
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('output')}: {t('keepFormat')}</div>
            </div>
          </div>
        }
      />

      <div className="grid gap-6 min-[1700px]:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel p-6 sm:p-8">
          <FileDropzone
            title={t('removeAudioCardTitle')}
            description={t('removeAudioCardDesc')}
            buttonLabel={t('selectVideo')}
            accept="video/mp4,.mp4,video/x-matroska,.mkv"
            disabled={isProcessing}
            aside={<span className="badge">MP4 / MKV</span>}
            onSelect={(files) => void handleSelectFile(files)}
          />

          {error ? <div className="mt-6"><AlertBanner tone="error" title={t('removeAudioError')} message={error} /></div> : null}
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
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('targetOutput')}</p>
                    <p className="mt-2 font-semibold text-slate-900">{t('keepFormat')} · {video.extension.toUpperCase()}</p>
                  </div>

                  <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:flex xl:flex-wrap">
                    <button type="button" className="btn-primary w-full sm:w-auto" onClick={handleRemoveAudio} disabled={isProcessing}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                        <path d="M4 9h4l5-4v14l-5-4H4Z" />
                        <path d="m17 9 4 6" />
                        <path d="m21 9-4 6" />
                      </svg>
                      {isProcessing ? t('removingAudio') : t('removeAudioBtn')}
                    </button>
                    <button type="button" className="btn-secondary w-full sm:w-auto" onClick={clearAll} disabled={isProcessing}>
                      {t('clearContent')}
                    </button>
                    {result ? (
                      <button type="button" className="btn-download w-full sm:w-auto" onClick={() => downloadFromUrl(result.url, result.fileName)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                          <path d="M12 4v10" />
                          <path d="m8 10 4 4 4-4" />
                          <path d="M5 19h14" />
                        </svg>
                        {t('downloadMutedVideo')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState badge={t('noVideoSelected')} title={t('emptyRemoveAudioTitle')} description={t('emptyRemoveAudioDesc')} />
            </div>
          )}
        </section>

        <section className="panel p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold text-slate-950">{t('removeAudioStatusTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('removeAudioStatusDesc')}</p>

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
                <p className="text-sm font-semibold text-emerald-700">{t('mutedVideoReady')}</p>
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
              {t('removeAudioHint')}
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
