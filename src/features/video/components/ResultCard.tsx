import { formatBytes } from '../../../lib/format'
import { useLocale } from '../../../i18n/LocaleProvider'
import type { MergeResult } from '../../../types/video'

interface ResultCardProps {
  result: MergeResult
  onDownload: () => void
}

export function ResultCard({ result, onDownload }: ResultCardProps) {
  const { t } = useLocale()

  return (
    <section className="panel p-6 sm:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <span className="badge mb-3 bg-emerald-100 text-emerald-700">{t('finalFileReadyBadge')}</span>
          <h2 className="text-xl font-extrabold text-slate-950">{t('finalFileDownloadTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Archivo: {result.fileName} · Tamano aproximado: {formatBytes(result.size)}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {t('outputUsed')}: {result.outputFormat.toUpperCase()} · {t('methodUsed')}: {result.strategy === 'fast' ? t('fastRouteUsed') : t('compatibleRouteUsed')}
          </p>
        </div>

        <button type="button" className="btn-download" onClick={onDownload}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
            <path d="M12 4v10" />
            <path d="m8 10 4 4 4-4" />
            <path d="M5 19h14" />
          </svg>
          {t('downloadFinalVideo')}
        </button>
      </div>
    </section>
  )
}
