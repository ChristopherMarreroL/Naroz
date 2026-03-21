import { useEffect, useMemo, useState } from 'react'

import { AlertBanner } from './components/AlertBanner'
import { FilePicker } from './components/FilePicker'
import { ProgressCard } from './components/ProgressCard'
import { ResultCard } from './components/ResultCard'
import { VideoList } from './components/VideoList'
import { useVideoMerger } from './hooks/useVideoMerger'
import { useVideoQueue } from './hooks/useVideoQueue'
import { downloadFromUrl } from './lib/download'
import { getCompatibilityWarnings } from './lib/media'

interface Notice {
  tone: 'error' | 'warning' | 'success' | 'info'
  title: string
  message: string
}

function App() {
  const { videos, addVideos, removeVideo, clearVideos, moveVideo, totalDuration } = useVideoQueue()
  const { progress, isLoadingEngine, isProcessing, result, error, ensureLoaded, mergeVideos } = useVideoMerger()
  const [notice, setNotice] = useState<Notice | null>({
    tone: 'info',
    title: 'Procesamiento local',
    message: 'Los videos se unen en tu navegador. La primera carga de ffmpeg.wasm puede tardar un poco.',
  })

  const compatibilityWarnings = useMemo(() => getCompatibilityWarnings(videos), [videos])

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

    const merged = await mergeVideos(videos)
    if (merged) {
      setNotice({
        tone: 'success',
        title: 'Union completada',
        message: 'El archivo final esta listo para descargarse desde el navegador.',
      })
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <section className="panel relative overflow-hidden px-6 py-8 sm:px-8 sm:py-10">
        <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.1),transparent_70%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div>
            <span className="badge mb-4 bg-slate-900 text-slate-50">Unir videos en el navegador</span>
            <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">
              Una app web moderna para combinar tus videos MP4 o MKV en el orden que elijas
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
              Sube varios archivos, revisa una vista previa, ajusta el orden final y genera una descarga unica sin salir de esta pagina.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">Flujo rapido</p>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
              <li>1. Selecciona varios MP4 o MKV.</li>
              <li>2. Reordena la lista con subir y bajar.</li>
              <li>3. Presiona "Unir videos".</li>
              <li>4. Descarga el archivo final.</li>
            </ol>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6">
        <FilePicker onSelect={handleSelectVideos} disabled={isProcessing} />

        {error ? (
          <AlertBanner
            tone="error"
            title="No se pudo completar la union"
            message={error}
          />
        ) : null}

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
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Cuando el orden este listo, inicia la union desde aqui.
              </p>
            </div>

            <div className="grid gap-3">
              <button type="button" className="btn-primary w-full" onClick={handleMergeVideos} disabled={isProcessing}>
                {isProcessing ? 'Uniendo videos...' : 'Unir videos'}
              </button>
              <p className="text-xs leading-5 text-slate-500">
                El tiempo depende del peso de los archivos y de la potencia de tu equipo.
              </p>
            </div>
          </div>
        </section>

        {result ? (
          <ResultCard result={result} onDownload={() => downloadFromUrl(result.url, result.fileName)} />
        ) : null}
      </div>
    </main>
  )
}

export default App
