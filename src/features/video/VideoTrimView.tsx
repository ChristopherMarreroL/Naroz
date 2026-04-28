import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { BetaNotice } from '../../components/shared/BetaNotice'
import { EmptyState } from '../../components/shared/EmptyState'
import { FileDropzone } from '../../components/shared/FileDropzone'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes, formatDuration, formatResolution } from '../../lib/format'
import type { VideoOutputFormat } from '../../types/video'
import { createVideoItem, isSupportedVideo } from './lib/media'
import { useVideoTrimmer } from './hooks/useVideoTrimmer'

function ToolbarIcon({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-950 text-white">{children}</span>
}

export function VideoTrimView() {
  const { t } = useLocale()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [video, setVideo] = useState<Awaited<ReturnType<typeof createVideoItem>> | null>(null)
  const [startTime, setStartTime] = useState(0)
  const [endTime, setEndTime] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'info' | 'success' | 'error'; title: string; message: string } | null>({
    tone: 'info',
    title: t('trimLocalProcessing'),
    message: t('trimInitialNotice'),
  })
  const { progress, isProcessing, result, error, ensureLoaded, trimVideo } = useVideoTrimmer()

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

  const outputFormat: VideoOutputFormat = useMemo(() => video?.extension ?? 'mp4', [video])
  const maxDuration = useMemo(() => Math.max(0, Math.floor(video?.duration ?? 0)), [video])
  const clipDuration = Math.max(0, endTime - startTime)
  const timelineDenominator = Math.max(video?.duration ?? 0, 1)
  const startPercent = Math.min(100, (startTime / timelineDenominator) * 100)
  const endPercent = Math.min(100, (endTime / timelineDenominator) * 100)
  const playheadPercent = Math.min(100, ((currentTime || 0) / timelineDenominator) * 100)

  const clearAll = () => {
    setVideo((current) => {
      if (current?.previewUrl) {
        URL.revokeObjectURL(current.previewUrl)
      }

      return null
    })
    setStartTime(0)
    setEndTime(0)
    setCurrentTime(0)
    setIsPreviewPlaying(false)
    setNotice({ tone: 'info', title: t('contentCleared'), message: t('trimInitialNotice') })
  }

  useEffect(() => {
    const player = videoRef.current
    if (!player) {
      return
    }

    const handleTimeUpdate = () => {
      setCurrentTime(player.currentTime)

      if (isPreviewPlaying && player.currentTime >= endTime) {
        player.pause()
        player.currentTime = startTime
        setCurrentTime(startTime)
        setIsPreviewPlaying(false)
      }
    }

    const handlePause = () => {
      setIsPreviewPlaying(false)
    }

    const handlePlay = () => {
      if (player.currentTime < startTime || player.currentTime > endTime) {
        player.currentTime = startTime
      }
    }

    player.addEventListener('timeupdate', handleTimeUpdate)
    player.addEventListener('pause', handlePause)
    player.addEventListener('play', handlePlay)

    return () => {
      player.removeEventListener('timeupdate', handleTimeUpdate)
      player.removeEventListener('pause', handlePause)
      player.removeEventListener('play', handlePlay)
    }
  }, [endTime, isPreviewPlaying, startTime, video])

  useEffect(() => {
    if (!videoRef.current) {
      return
    }

    if (currentTime < startTime || currentTime > endTime) {
      videoRef.current.currentTime = startTime
    }
  }, [startTime, endTime, currentTime])

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

    const detectedDuration = Math.max(1, Math.floor(item.duration ?? 0))
    setStartTime(0)
    setEndTime(detectedDuration)
    setCurrentTime(0)
    setIsPreviewPlaying(false)
    setNotice({ tone: 'success', title: t('videoLoaded'), message: t('trimFileReady') })
  }

  const handlePreviewSelection = async () => {
    const player = videoRef.current
    if (!player) {
      return
    }

    if (isPreviewPlaying) {
      player.pause()
      setIsPreviewPlaying(false)
      return
    }

    player.currentTime = startTime
    setCurrentTime(startTime)
    await player.play()
    setIsPreviewPlaying(true)
  }

  const handleTimelineSeek = (nextTime: number) => {
    const boundedTime = Math.max(0, Math.min(nextTime, video?.duration ?? nextTime))
    setCurrentTime(boundedTime)
    if (videoRef.current) {
      videoRef.current.currentTime = boundedTime
    }
  }

  const handleTrim = async () => {
    if (!video) {
      setNotice({ tone: 'error', title: t('missingVideo'), message: t('trimMissingRange') })
      return
    }

    if (endTime <= startTime) {
      setNotice({ tone: 'error', title: t('trimError'), message: t('trimInvalidRange') })
      return
    }

    const trimmed = await trimVideo(video.file, startTime, endTime, outputFormat)
    if (trimmed) {
      setNotice({ tone: 'success', title: t('trimCompleted'), message: t('trimCompletedMessage') })
    }
  }

  return (
    <>
      <SectionHero
        badge={t('trimVideoBadge')}
        title={t('trimVideoTitle')}
        description={t('trimVideoDesc')}
        aside={
          <div className="rounded-[1.5rem] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{t('currentScope')}</p>
            <div className="mt-4 space-y-2 text-sm text-slate-200">
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('input')}: MP4 / MKV / MOV</div>
              <div className="rounded-2xl bg-white/8 px-4 py-3">{t('keepFormat')}: {outputFormat.toUpperCase()}</div>
            </div>
          </div>
        }
      />

      <div className="grid gap-6 min-[1700px]:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel p-6 sm:p-8">
          <BetaNotice message={t('betaTrimMessage')} />

          <div className="mt-6">
            <FileDropzone
              title={t('trimVideoCardTitle')}
              description={t('trimVideoCardDesc')}
              buttonLabel={t('selectVideo')}
              accept="video/mp4,.mp4,video/x-matroska,.mkv,video/quicktime,.mov"
              disabled={isProcessing}
              aside={<span className="badge">MP4 / MKV / MOV</span>}
              onSelect={(files) => void handleSelectFile(files)}
            />
          </div>

          {error ? <div className="mt-6"><AlertBanner tone="error" title={t('trimError')} message={error} /></div> : null}
          {notice ? <div className="mt-6"><AlertBanner tone={notice.tone} title={notice.title} message={notice.message} /></div> : null}

          {video ? (
            <div className="mt-6 grid gap-5 2xl:grid-cols-[320px_minmax(0,1fr)]">
                <div className="panel-subtle overflow-hidden p-3">
                  <div className="overflow-hidden rounded-[1.2rem] bg-slate-100">
                    <video ref={videoRef} src={video.previewUrl} className="aspect-video h-full w-full object-cover" controls preload="metadata" />
                  </div>

                  <div className="mt-4 rounded-[1.2rem] border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      <span>{t('fullTimeline')}</span>
                      <span>{formatDuration(currentTime)}</span>
                    </div>

                    <div className="relative mt-4 h-24">
                      <div className="absolute left-0 right-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-slate-200" />
                      <div className="absolute left-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-white/80" style={{ width: `${startPercent}%` }} />
                      <div className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-sky-500 shadow-[0_0_0_1px_rgba(14,165,233,0.08)]" style={{ left: `${startPercent}%`, width: `${Math.max(0, endPercent - startPercent)}%` }} />
                      <div className="absolute right-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-white/80" style={{ width: `${Math.max(0, 100 - endPercent)}%` }} />
                      <div className="absolute top-1/2 h-8 w-[2px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-950" style={{ left: `${playheadPercent}%` }} />

                      <div className="absolute top-1/2 z-30 -translate-x-1/2 -translate-y-1/2" style={{ left: `${startPercent}%` }}>
                        <div className="trim-handle trim-handle-start">
                          <span className="trim-handle-label">{t('startTime')}</span>
                        </div>
                      </div>

                      <div className="absolute top-1/2 z-30 -translate-x-1/2 -translate-y-1/2" style={{ left: `${endPercent}%` }}>
                        <div className="trim-handle trim-handle-end">
                          <span className="trim-handle-label">{t('endTime')}</span>
                        </div>
                      </div>

                      <input
                        type="range"
                        min={0}
                        max={maxDuration}
                        value={startTime}
                        onChange={(event) => {
                          const nextStart = Math.min(Number(event.target.value), Math.max(0, endTime - 1))
                          setStartTime(nextStart)
                          if (currentTime < nextStart) {
                            handleTimelineSeek(nextStart)
                          }
                        }}
                        disabled={isProcessing}
                        className="trim-range trim-range-start absolute inset-x-0 top-1/2 z-40 w-full -translate-y-1/2 appearance-none bg-transparent"
                      />
                      <input
                        type="range"
                        min={0}
                        max={maxDuration}
                        value={endTime}
                        onChange={(event) => {
                          const nextEnd = Math.max(Number(event.target.value), startTime + 1)
                          setEndTime(nextEnd)
                          if (currentTime > nextEnd) {
                            handleTimelineSeek(nextEnd)
                          }
                        }}
                        disabled={isProcessing}
                        className="trim-range trim-range-end absolute inset-x-0 top-1/2 z-40 w-full -translate-y-1/2 appearance-none bg-transparent"
                      />

                      <div className="absolute left-0 right-0 top-0 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                        <span>0:00</span>
                        <span>{formatDuration(video.duration)}</span>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                      <div className="rounded-2xl bg-slate-50 px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{t('startTime')}</p>
                        <p className="mt-1 font-semibold text-slate-900">{formatDuration(startTime)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{t('clipDuration')}</p>
                        <p className="mt-1 font-semibold text-slate-900">{formatDuration(clipDuration)}</p>
                      </div>
                      <div className="rounded-2xl bg-slate-50 px-3 py-2">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{t('endTime')}</p>
                        <p className="mt-1 font-semibold text-slate-900">{formatDuration(endTime)}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <div className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/90 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => handleTimelineSeek(startTime)}
                          disabled={isProcessing}
                        >
                          <ToolbarIcon>
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="2">
                              <path d="M7 5v14" />
                              <path d="m18 6-7 6 7 6" />
                            </svg>
                          </ToolbarIcon>
                          {t('startTime')}
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => handleTimelineSeek(endTime)}
                          disabled={isProcessing}
                        >
                          <ToolbarIcon>
                            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth="2">
                              <path d="M17 5v14" />
                              <path d="m6 6 7 6-7 6" />
                            </svg>
                          </ToolbarIcon>
                          {t('endTime')}
                        </button>
                        <div className="hidden h-7 w-px bg-slate-200 sm:block" />
                        <button
                          type="button"
                          className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            isPreviewPlaying
                              ? 'bg-slate-950 text-white hover:bg-slate-800'
                              : 'bg-white text-slate-700 hover:bg-slate-100'
                          }`}
                          onClick={() => void handlePreviewSelection()}
                          disabled={isProcessing || clipDuration <= 0}
                        >
                          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${isPreviewPlaying ? 'bg-white/15 text-white' : 'bg-slate-950 text-white'}`}>
                            {isPreviewPlaying ? (
                              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                                <path d="M7 5h3v14H7zM14 5h3v14h-3z" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 fill-current">
                                <path d="m8 5 11 7-11 7z" />
                              </svg>
                            )}
                          </span>
                          {isPreviewPlaying ? t('pausePreview') : t('previewTrimSelection')}
                        </button>
                      </div>
                    </div>
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
                  <h3 className="text-sm font-semibold text-slate-900">{t('trimRange')}</h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('startTime')}</span>
                      <input type="number" min={0} max={Math.max(0, endTime - 1)} step={1} value={startTime} onChange={(event) => setStartTime(Number(event.target.value))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400" disabled={isProcessing} />
                      <p className="mt-2 text-xs text-slate-500">{t('startTimeDesc')}</p>
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('endTime')}</span>
                      <input type="number" min={Math.min(maxDuration, startTime + 1)} max={maxDuration} step={1} value={endTime} onChange={(event) => setEndTime(Number(event.target.value))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400" disabled={isProcessing} />
                      <p className="mt-2 text-xs text-slate-500">{t('endTimeDesc')}</p>
                    </label>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                    <p>{t('trimOutputDesc')}</p>
                    <p className="mt-2">{t('duration')}: {formatDuration(video.duration)}</p>
                    <p className="mt-2">{t('navigationStateHint')}</p>
                  </div>

                  <div className="mt-5 grid gap-3 lg:grid-cols-2 xl:flex xl:flex-wrap">
                    <button type="button" className="btn-primary w-full sm:w-auto" onClick={handleTrim} disabled={isProcessing}>
                      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                        <path d="M6 5h4v6H6z" />
                        <path d="M14 13h4v6h-4z" />
                        <path d="m10 11 4 2" />
                      </svg>
                      {isProcessing ? t('trimmingVideo') : t('trimVideoBtn')}
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
                        {t('downloadTrimmedVideo')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState badge={t('noVideoSelected')} title={t('emptyTrimVideoTitle')} description={t('emptyTrimVideoDesc')} />
            </div>
          )}
        </section>

        <section className="panel p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold text-slate-950">{t('trimStatusTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('trimStatusDesc')}</p>

          <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-slate-950 transition-all duration-300" style={{ width: `${progress.percent}%` }} />
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-slate-400">
            <span>{progress.stage}</span>
            <span>{progress.percent}%</span>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('keepFormat')}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{outputFormat.toUpperCase()}</p>
            </div>
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('progressDetail')}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{progress.detail ?? t('waitingFile')}</p>
            </div>
            {result ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">{t('trimmedFileReady')}</p>
                <p className="mt-2 text-sm leading-6 text-emerald-700">{result.fileName} · {formatBytes(result.size)}</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </>
  )
}
