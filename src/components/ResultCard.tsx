import { formatBytes } from '../lib/format'
import type { MergeResult } from '../types/video'

interface ResultCardProps {
  result: MergeResult
  onDownload: () => void
}

export function ResultCard({ result, onDownload }: ResultCardProps) {
  return (
    <section className="panel p-6 sm:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <span className="badge mb-3 bg-emerald-100 text-emerald-700">Video listo</span>
          <h2 className="text-xl font-extrabold text-slate-950">Descarga tu archivo final</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Archivo: {result.fileName} · Tamano aproximado: {formatBytes(result.size)}
          </p>
        </div>

        <button type="button" className="btn-primary" onClick={onDownload}>
          Descargar video final
        </button>
      </div>
    </section>
  )
}
