import { useEffect, useMemo, useRef, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { EmptyState } from '../../components/shared/EmptyState'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes, formatDuration, formatResolution } from '../../lib/format'
import { createVideoItem, isSupportedVideo } from './lib/media'
import { useVideoSpeedChanger } from './hooks/useVideoSpeedChanger'

const SPEED_OPTIONS = [0.5, 1, 1.5, 2] as const

function formatPlaybackRate(rate: number) {
  return `${rate}x`
}

export function VideoSpeedView() {
  const { t } = useLocale()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [video, setVideo] = useState<Awaited<ReturnType<typeof createVideoItem>> | null>(null)
  const [playbackRate, setPlaybackRate] = useState<(typeof SPEED_OPTIONS)[number]>(1)
  const [notice, setNotice] = useState<{ tone: 'info' | 'success' | 'error'; title: string; message: string } | null>({
    tone: 'info',
    title: t('localConversion'),
    message: t('changeSpeedCardDesc'),
  })
  const { progress, isProcessing, result, error, ensureLoaded, changeSpeed } = useVideoSpeedChanger()

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

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate
    }
  }, [playbackRate, video])

  const outputInfo = useMemo(() => formatPlaybackRate(playbackRate), [playbackRate])

  const clearAll = () => {
    setVideo((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl)
      }

      return null
    })
    setPlaybackRate(1)
    setNotice({ tone: 'info', title: t('contentCleared'), message: t('changeSpeedCardDesc') })
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
    setPlaybackRate(1)
    setNotice({ tone: 'success', title: t('videoLoaded'), message: t('videoReadyToChangeSpeed') })
  }

  const handleChangeSpeed = async () => {
    if (!video) {
      setNotice({ tone: 'error', title: t('missingVideo'), message: t('selectVideoBeforeSpeedChange') })
      return
    }

    const changed = await changeSpeed(video.file, playbackRate)
    if (changed) {
      setNotice({
        tone: 'success',
        title: t('speedCompleted'),
        message: `${t('speedCompletedMessage')} ${formatPlaybackRate(changed.playbackRate)}.`,
      })
    }
  }

  return (
    <>
      <SectionHero
        badge={t('changeSpeedBadge')}
        title={t('changeSpeedTitle')}
        description={t('changeSpeedLongDesc')}
        aside={
          <div className="rounded-[1.5rem] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{t('currentScope')}</p>
            <div className="mt-4 space-y-2 text-sm text-slate-200">
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('input')}: MP4 / MKV / MOV</div>
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('output')}: {t('keepFormat')}</div>
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('playbackSpeed')}: 0.5x / 1x / 1.5x / 2x</div>
            </div>
          </div>
        }
      />

      <div className="grid gap-6 min-[1700px]:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel p-6 sm:p-8">
          <FileDropzone
            title={t('changeSpeedCardTitle')}
            description={t('changeSpeedCardDesc')}
            buttonLabel={t('selectVideo')}
            accept="video/mp4,.mp4,video/x-matroska,.mkv,video/quicktime,.mov"
            disabled={isProcessing}
            aside={<span className="badge">MP4 / MKV / MOV</span>}
            onSelect={(files) => void handleSelectFile(files)}
          />

          {error ? <div className="mt-6"><AlertBanner tone="error" title={t('speedVideoError')} message={error} /></div> : null}
          {notice ? <div className="mt-6"><AlertBanner tone={notice.tone} title={notice.title} message={notice.message} /></div> : null}

          {video ? (
            <div className="mt-6 grid gap-5 2xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="panel-subtle overflow-hidden p-3">
                <div className="overflow-hidden rounded-[1.2rem] bg-slate-100">
                  <video ref={videoRef} src={video.previewUrl} className="aspect-video h-full w-full object-cover" controls preload="metadata" />
                </div>
              </div>

              <div className="grid gap-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('name')}</p><p className="mt-2 break-words text-sm font-semibold text-slate-900">{video.name}</p></div>
                  <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('size')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{formatBytes(video.size)}</p></div>
                  <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('format')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{video.extension.toUpperCase()}</p></div>
                  <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('resolution')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{formatResolution(video.width, video.height)}</p></div>
                </div>

                <div className="panel-subtle p-5 sm:p-6">
                  <p className="text-sm font-semibold text-slate-900">{t('speedSelection')}</p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {SPEED_OPTIONS.map((option) => {
                      const isActive = playbackRate === option
                      return (
                        <button
                          key={option}
                          type="button"
                          className={`rounded-2xl border px-4 py-4 text-left transition ${isActive ? 'border-slate-900 bg-slate-900 text-white shadow-[0_18px_30px_-22px_rgba(15,23,42,0.75)]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
                          onClick={() => setPlaybackRate(option)}
                          disabled={isProcessing}
                        >
                          <p className="text-lg font-bold">{formatPlaybackRate(option)}</p>
                          <p className={`mt-1 text-xs uppercase tracking-[0.18em] ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                            {option === 1 ? t('normalSpeed') : option < 1 ? t('slowerSpeed') : t('fasterSpeed')}
                          </p>
                        </button>
                      )
                    })}
                  </div>

                  <div className="mt-4">
                    <AlertBanner tone="info" title={t('speedPreviewTitle')} message={t('speedPreviewHint')} />
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button type="button" className="btn-primary w-full sm:w-auto" onClick={handleChangeSpeed} disabled={isProcessing}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                        <path d="M4 14a8 8 0 1 1 2.34 5.66" />
                        <path d="M4 20v-6h6" />
                        <path d="M12 8v4l3 2" />
                      </svg>
                      {isProcessing ? t('changingSpeed') : t('changeSpeedBtn')}
                    </button>
                    <button type="button" className="btn-secondary w-full sm:w-auto" onClick={clearAll} disabled={isProcessing}>{t('clearContent')}</button>
                    {result ? (
                      <button type="button" className="btn-download w-full sm:w-auto" onClick={() => downloadFromUrl(result.url, result.fileName)}>
                        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                          <path d="M12 4v10" />
                          <path d="m8 10 4 4 4-4" />
                          <path d="M5 19h14" />
                        </svg>
                        {t('downloadSpeedChangedVideo')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6"><EmptyState badge={t('noVideoSelected')} title={t('emptySpeedVideoTitle')} description={t('emptySpeedVideoDesc')} /></div>
          )}
        </section>

        <section className="panel p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold text-slate-950">{t('speedStatusTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('speedStatusDesc')}</p>

          <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-slate-950 transition-all duration-300" style={{ width: `${progress.percent}%` }} />
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <span>{progress.stage}</span>
            <span>{progress.percent}%</span>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('targetOutput')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{outputInfo}</p></div>
            <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('progressDetail')}</p><p className="mt-2 text-sm leading-6 text-slate-600">{progress.detail ?? t('waitingFile')}</p></div>
            {result ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-sm font-semibold text-emerald-700">{t('speedOutputReady')}</p><p className="mt-2 text-sm leading-6 text-emerald-700">{result.fileName} - {formatBytes(result.size)}</p></div> : null}
            {video ? <div className="panel-subtle p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('duration')}</p><p className="mt-2 text-sm font-semibold text-slate-900">{formatDuration(video.duration)}</p></div> : null}
          </div>
        </section>
      </div>
    </>
  )
}
