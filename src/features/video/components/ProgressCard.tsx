import type { MergeProgress } from '../../../types/video'
import { useLocale } from '../../../i18n/LocaleProvider'

interface ProgressCardProps {
  progress: MergeProgress
  isLoadingEngine: boolean
  isProcessing: boolean
}

export function ProgressCard({ progress, isLoadingEngine, isProcessing }: ProgressCardProps) {
  const { t } = useLocale()
  const isBusy = isLoadingEngine || isProcessing
  const stages = [
    { key: 'preparing', label: t('stagePreparing') },
    { key: 'converting', label: t('stageConverting') },
    { key: 'merging', label: t('stageMerging') },
  ] as const

  return (
    <section className="panel p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-950">{t('processingStatusTitle')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{progress.message}</p>
          {progress.detail ? <p className="mt-1 text-xs leading-5 text-slate-500">{progress.detail}</p> : null}
        </div>
        <span className="badge">{isBusy ? t('processingNow') : t('waitingStatus')}</span>
      </div>

      <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-950 transition-all duration-300" style={{ width: `${progress.percent}%` }} />
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {stages.map((stage) => {
          const isActive = progress.stage === stage.key
          const isDone = ['finished'].includes(progress.stage) || progress.percent >= (stage.key === 'preparing' ? 33 : stage.key === 'converting' ? 74 : 95)

          return (
            <div
              key={stage.key}
              className={`rounded-2xl border px-4 py-3 text-sm ${
                isActive
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : isDone
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              <p className="font-semibold">{stage.label}</p>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-slate-400">
        <span>{progress.stage}</span>
        <span>{progress.percent}%</span>
      </div>
    </section>
  )
}
