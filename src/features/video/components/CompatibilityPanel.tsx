import type { MergeStrategy, VideoItem, VideoOutputFormat } from '../../../types/video'
import { useLocale } from '../../../i18n/LocaleProvider'

interface CompatibilityPanelProps {
  videos: VideoItem[]
  outputFormat: VideoOutputFormat
  strategy: MergeStrategy
}

function getUniqueCount(values: string[]) {
  return new Set(values).size
}

export function CompatibilityPanel({ videos, outputFormat, strategy }: CompatibilityPanelProps) {
  const { locale, t } = useLocale()
  const formats = videos.map((video) => video.extension.toUpperCase())
  const resolutions = videos
    .filter((video) => video.width && video.height)
    .map((video) => `${video.width}x${video.height}`)

  const sameFormat = getUniqueCount(formats) <= 1
  const sameResolution = getUniqueCount(resolutions) <= 1
  const missingMetadata = videos.some((video) => !video.width || !video.height || !video.duration)

  const checks = [
    {
      label: t('format'),
      value: sameFormat ? formats[0] ?? t('unknown') : t('mixed'),
      ok: sameFormat,
      detail: sameFormat ? t('allSameContainer') : t('mixedContainers'),
    },
    {
      label: t('resolution'),
      value: sameResolution ? resolutions[0] ?? t('unknown') : t('mixed'),
      ok: sameResolution,
      detail: sameResolution ? t('allSameSize') : t('mixedResolutions'),
    },
    {
      label: t('finalOutput'),
      value: outputFormat.toUpperCase(),
      ok: true,
      detail: locale === 'es' ? 'Este sera el formato descargable al finalizar.' : 'This will be the downloadable format at the end.',
    },
    {
      label: t('likelyRoute'),
      value: strategy === 'fast' ? t('fast') : 'Compatible',
      ok: strategy === 'fast',
      detail: strategy === 'fast' ? t('canMergeWithoutHeavyConversion') : t('needsConversionBeforeMerging'),
    },
  ]

  return (
    <section className="panel p-6 sm:p-8">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-950">{t('technicalAnalysisTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('technicalAnalysisDesc')}</p>
        </div>
        <span className={`badge ${strategy === 'fast' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          {strategy === 'fast' ? t('fastRoutePossible') : t('conversionLikely')}
        </span>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {checks.map((check) => (
          <article key={check.label} className="panel-subtle p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{check.label}</p>
              <span className={`h-2.5 w-2.5 rounded-full ${check.ok ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            </div>
            <p className="mt-3 text-lg font-bold text-slate-950">{check.value}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{check.detail}</p>
          </article>
        ))}
      </div>

      {missingMetadata ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {t('missingMetadataWarning')}
        </div>
      ) : null}
    </section>
  )
}
