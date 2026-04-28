import { useEffect, useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { EmptyState } from '../../components/shared/EmptyState'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
import { downloadFromUrl } from '../../lib/download'
import { getCompatibilityWarnings, resolveMergeStrategy } from './lib/media'
import { CompatibilityPanel } from './components/CompatibilityPanel'
import { FilePicker } from './components/FilePicker'
import { ProgressCard } from './components/ProgressCard'
import { ResultCard } from './components/ResultCard'
import { VideoList } from './components/VideoList'
import { useVideoMerger } from './hooks/useVideoMerger'
import { useVideoQueue } from './hooks/useVideoQueue'
import type { VideoOutputFormat } from '../../types/video'

interface Notice {
  tone: 'error' | 'warning' | 'success' | 'info'
  title: string
  message: string
}

export function VideoMergeView() {
  const { locale, t } = useLocale()
  const { videos, addVideos, removeVideo, clearVideos, moveVideo, totalDuration } = useVideoQueue()
  const { progress, isLoadingEngine, isProcessing, result, error, ensureLoaded, mergeVideos } = useVideoMerger()
  const [outputFormat, setOutputFormat] = useState<VideoOutputFormat>('mp4')
  const [notice, setNotice] = useState<Notice | null>({
    tone: 'info',
    title: t('processingLocal'),
    message: t('mergeLocalInfo'),
  })

  const compatibilityWarnings = useMemo(() => getCompatibilityWarnings(videos, outputFormat), [videos, outputFormat])
  const mergeStrategy = useMemo(() => resolveMergeStrategy(videos, outputFormat), [videos, outputFormat])

  useEffect(() => {
    void ensureLoaded()
  }, [ensureLoaded])

  const handleSelectVideos = async (files: FileList) => {
    const { addedCount, rejectedFiles } = await addVideos(files)

    if (rejectedFiles.length > 0) {
      setNotice({
        tone: 'warning',
        title: t('mergeSkippedTitle'),
        message: `${t('mergeSkippedMessage')} ${rejectedFiles.join(', ')}.`,
      })
      return
    }

    if (addedCount > 0) {
      setNotice({
        tone: 'success',
        title: t('videoAdded'),
        message: t('mergeReadyMessage'),
      })
    }
  }

  const handleMergeVideos = async () => {
    if (videos.length === 0) {
      setNotice({
        tone: 'error',
        title: t('emptyListTitle'),
        message: t('emptyListMessage'),
      })
      return
    }

    const merged = await mergeVideos(videos, mergeStrategy, outputFormat)
    if (merged) {
      setNotice({
        tone: 'success',
        title: t('mergeComplete'),
        message: `${t('mergeFinalReady')} ${merged.outputFormat.toUpperCase()} · ${merged.strategy === 'fast' ? t('fastRouteUsed') : t('compatibleRouteUsed')}.`,
      })
    }
  }

  return (
    <>
      <SectionHero
        badge={t('mergeHeroBadge')}
        title={t('mergeHeroTitle')}
        description={t('mergeHeroDesc')}
        aside={
          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">{t('autoRoute')}</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
               <li>{t('mergeRouteLine1')}</li>
               <li>{t('mergeRouteLine2')}</li>
               <li>{t('mergeRouteLine3')}</li>
            </ul>
          </div>
        }
      />

      <div className="grid gap-6">
        <FilePicker onSelect={handleSelectVideos} disabled={isProcessing} />

        {error ? <AlertBanner tone="error" title={t('noMergeError')} message={error} /> : null}
        {notice ? <AlertBanner tone={notice.tone} title={notice.title} message={notice.message} /> : null}

        {compatibilityWarnings.length > 0 ? (
          <div className="grid gap-3">
            {compatibilityWarnings.map((warning) => (
              <AlertBanner key={warning} tone="warning" title={t('warnings')} message={warning} />
            ))}
          </div>
        ) : null}

        {videos.length > 0 ? (
          <CompatibilityPanel videos={videos} outputFormat={outputFormat} strategy={mergeStrategy} />
        ) : null}

        {videos.length > 0 ? (
          <VideoList
            videos={videos}
            totalDuration={totalDuration}
            disabled={isProcessing}
            onMove={moveVideo}
            onRemove={removeVideo}
            onClear={() => {
              clearVideos()
              setNotice({
                tone: 'info',
                title: locale === 'es' ? 'Lista limpiada' : 'List cleared',
                message: locale === 'es' ? 'Puedes volver a seleccionar otros videos cuando quieras.' : 'You can select different videos whenever you want.',
              })
            }}
          />
        ) : (
          <EmptyState
            badge={t('noVideo')}
            title={t('emptyVideoTitle')}
            description={t('emptyVideoDesc')}
          />
        )}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <ProgressCard progress={progress} isLoadingEngine={isLoadingEngine} isProcessing={isProcessing} />

          <div className="panel flex flex-col justify-between gap-4 p-6 sm:p-8">
            <div>
              <h2 className="text-xl font-extrabold text-slate-950">{t('mergeActions')}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{t('mergeActionsDesc')}</p>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge bg-slate-900 text-slate-50">{t('finalFormat')}: {outputFormat.toUpperCase()}</span>
                  <span className="badge">
                    {mergeStrategy === 'fast' ? t('likelyRouteFast') : t('likelyRouteCompatible')}
                  </span>
                </div>
                <div className="mt-4">
                  <label htmlFor="video-output-format" className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    {t('finalFormat')}
                  </label>
                  <select
                    id="video-output-format"
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                    value={outputFormat}
                    onChange={(event) => setOutputFormat(event.target.value as VideoOutputFormat)}
                    disabled={isProcessing}
                  >
                    <option value="mp4">MP4</option>
                    <option value="mkv">MKV</option>
                    <option value="mov">MOV</option>
                  </select>
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-500">
                  {mergeStrategy === 'fast'
                    ? `${t('mergeFastSummary')} ${outputFormat.toUpperCase()}.`
                    : `${t('mergeCompatibleSummary')} ${outputFormat.toUpperCase()}.`}
                </p>
              </div>

              <button type="button" className="btn-primary w-full" onClick={handleMergeVideos} disabled={isProcessing}>
                <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                  <path d="M7 7h6" />
                  <path d="M7 12h10" />
                  <path d="M7 17h6" />
                  <path d="m13 9 4 3-4 3" />
                </svg>
                {isProcessing
                  ? mergeStrategy === 'fast'
                    ? t('mergingFastRoute')
                    : t('convertingAndMerging')
                  : t('mergeVideosBtn')}
              </button>
              <p className="text-xs leading-5 text-slate-500">
                {t('waitMerge')}
              </p>
            </div>
          </div>
        </section>

        {result ? <ResultCard result={result} onDownload={() => downloadFromUrl(result.url, result.fileName)} /> : null}
      </div>
    </>
  )
}
