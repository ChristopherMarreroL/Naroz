import type { MergeProgress } from '../../../types/video'

interface ProgressCardProps {
  progress: MergeProgress
  isLoadingEngine: boolean
  isProcessing: boolean
}

export function ProgressCard({ progress, isLoadingEngine, isProcessing }: ProgressCardProps) {
  const isBusy = isLoadingEngine || isProcessing

  return (
    <section className="panel p-6 sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-950">Estado del procesamiento</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{progress.message}</p>
          {progress.detail ? <p className="mt-1 text-xs leading-5 text-slate-500">{progress.detail}</p> : null}
        </div>
        <span className="badge">{isBusy ? 'Procesando' : 'En espera'}</span>
      </div>

      <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-950 transition-all duration-300" style={{ width: `${progress.percent}%` }} />
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-slate-400">
        <span>{progress.stage}</span>
        <span>{progress.percent}%</span>
      </div>
    </section>
  )
}
