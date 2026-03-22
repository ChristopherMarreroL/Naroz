import { useEffect, useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { SectionHero } from '../../components/shared/SectionHero'
import { downloadFromUrl } from '../../lib/download'
import { getCompatibilityWarnings, resolveMergeStrategy } from './lib/media'
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
  const { videos, addVideos, removeVideo, clearVideos, moveVideo, totalDuration } = useVideoQueue()
  const { progress, isLoadingEngine, isProcessing, result, error, ensureLoaded, mergeVideos } = useVideoMerger()
  const [outputFormat, setOutputFormat] = useState<VideoOutputFormat>('mp4')
  const [notice, setNotice] = useState<Notice | null>({
    tone: 'info',
    title: 'Procesamiento local',
    message:
      'La herramienta decide automaticamente la ruta mas rapida o mas compatible segun los archivos que subas y el formato final elegido.',
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
        title: 'Algunos archivos no fueron agregados',
        message: `Esta version acepta MP4 y MKV. Omitidos: ${rejectedFiles.join(', ')}.`,
      })
      return
    }

    if (addedCount > 0) {
      setNotice({
        tone: 'success',
        title: 'Videos agregados',
        message: 'Ya puedes reordenarlos y luego presionar "Unir videos".',
      })
    }
  }

  const handleMergeVideos = async () => {
    if (videos.length === 0) {
      setNotice({
        tone: 'error',
        title: 'Lista vacia',
        message: 'Selecciona al menos un video MP4 o MKV antes de intentar unirlos.',
      })
      return
    }

    const merged = await mergeVideos(videos, mergeStrategy, outputFormat)
    if (merged) {
      setNotice({
        tone: 'success',
        title: 'Union completada',
        message: `El archivo final ${merged.outputFormat.toUpperCase()} esta listo. Se proceso con ${merged.strategy === 'fast' ? 'ruta rapida' : 'ruta compatible'}.`,
      })
    }
  }

  return (
    <>
      <SectionHero
        badge="Video / Unir videos"
        title="Une varios videos desde una herramienta modular y lista para crecer"
        description="Sube tus archivos, ordenalos, revisa la estrategia automatica elegida y descarga un unico MP4 final sin salir del navegador."
        aside={
          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">Ruta automatica</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
              <li>1. MP4 compatibles - ruta rapida</li>
              <li>2. Formatos o resoluciones mixtas - ruta compatible</li>
              <li>3. Salida final - MP4 o MKV</li>
            </ul>
          </div>
        }
      />

      <div className="grid gap-6">
        <FilePicker onSelect={handleSelectVideos} disabled={isProcessing} />

        {error ? <AlertBanner tone="error" title="No se pudo completar la union" message={error} /> : null}
        {notice ? <AlertBanner tone={notice.tone} title={notice.title} message={notice.message} /> : null}

        {compatibilityWarnings.length > 0 ? (
          <div className="grid gap-3">
            {compatibilityWarnings.map((warning) => (
              <AlertBanner key={warning} tone="warning" title="Compatibilidad" message={warning} />
            ))}
          </div>
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
                title: 'Lista limpiada',
                message: 'Puedes volver a seleccionar otros videos cuando quieras.',
              })
            }}
          />
        ) : (
          <section className="panel p-10 text-center">
            <h2 className="text-2xl font-extrabold text-slate-950">Todavia no hay videos en la lista</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
              Empieza seleccionando uno o varios archivos MP4 o MKV. Luego podras cambiar el orden, eliminar elementos y generar el video final.
            </p>
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <ProgressCard progress={progress} isLoadingEngine={isLoadingEngine} isProcessing={isProcessing} />

          <div className="panel flex flex-col justify-between gap-4 p-6 sm:p-8">
            <div>
              <h2 className="text-xl font-extrabold text-slate-950">Acciones</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">La herramienta decide sola la mejor estrategia para tu lista actual.</p>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge bg-slate-900 text-slate-50">Salida final: {outputFormat.toUpperCase()}</span>
                  <span className="badge">
                    {mergeStrategy === 'fast' ? 'Ruta automatica: rapida' : 'Ruta automatica: compatible'}
                  </span>
                </div>
                <div className="mt-4">
                  <label htmlFor="video-output-format" className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Formato final
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
                  </select>
                </div>
                <p className="mt-4 text-xs leading-5 text-slate-500">
                  {mergeStrategy === 'fast'
                    ? `Todos los videos actuales permiten usar una union mas veloz y dejar el resultado en ${outputFormat.toUpperCase()}.`
                    : `La herramienta detecto diferencias y necesita convertir antes de unir en ${outputFormat.toUpperCase()}.`}
                </p>
              </div>

              <button type="button" className="btn-primary w-full" onClick={handleMergeVideos} disabled={isProcessing}>
                {isProcessing
                  ? mergeStrategy === 'fast'
                    ? 'Uniendo con ruta rapida...'
                    : 'Convirtiendo y uniendo videos...'
                  : 'Unir videos'}
              </button>
              <p className="text-xs leading-5 text-slate-500">
                Si todos los videos ya coinciden con el formato final elegido, la ruta rapida evita conversiones innecesarias.
              </p>
            </div>
          </div>
        </section>

        {result ? <ResultCard result={result} onDownload={() => downloadFromUrl(result.url, result.fileName)} /> : null}
      </div>
    </>
  )
}
