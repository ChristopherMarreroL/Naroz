import { useEffect, useMemo, useState } from "react";

import { AlertBanner } from "./components/AlertBanner";
import { FilePicker } from "./components/FilePicker";
import { ProgressCard } from "./components/ProgressCard";
import { ResultCard } from "./components/ResultCard";
import { VideoList } from "./components/VideoList";
import { useVideoMerger } from "./hooks/useVideoMerger";
import { useVideoQueue } from "./hooks/useVideoQueue";
import { downloadFromUrl } from "./lib/download";
import { getCompatibilityWarnings, resolveMergeStrategy } from "./lib/media";

interface Notice {
  tone: "error" | "warning" | "success" | "info";
  title: string;
  message: string;
}

function App() {
  const {
    videos,
    addVideos,
    removeVideo,
    clearVideos,
    moveVideo,
    totalDuration,
  } = useVideoQueue();
  const {
    progress,
    isLoadingEngine,
    isProcessing,
    result,
    error,
    ensureLoaded,
    mergeVideos,
  } = useVideoMerger();
  const [notice, setNotice] = useState<Notice | null>({
    tone: "info",
    title: "Procesamiento local",
    message:
      "Los videos se procesan en tu navegador. Si mezclas formatos o resoluciones, la app intentara convertirlos a un MP4 comun antes de unirlos.",
  });

  const compatibilityWarnings = useMemo(
    () => getCompatibilityWarnings(videos),
    [videos],
  );
  const mergeStrategy = useMemo(() => resolveMergeStrategy(videos), [videos]);

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  const handleSelectVideos = async (files: FileList) => {
    const { addedCount, rejectedFiles } = await addVideos(files);

    if (rejectedFiles.length > 0) {
      setNotice({
        tone: "warning",
        title: "Algunos archivos no fueron agregados",
        message: `Esta version acepta MP4 y MKV. Omitidos: ${rejectedFiles.join(", ")}.`,
      });
      return;
    }

    if (addedCount > 0) {
      setNotice({
        tone: "success",
        title: "Videos agregados",
        message: 'Ya puedes reordenarlos y luego presionar "Unir videos".',
      });
    }
  };

  const handleMergeVideos = async () => {
    if (videos.length === 0) {
      setNotice({
        tone: "error",
        title: "Lista vacia",
        message:
          "Selecciona al menos un video MP4 o MKV antes de intentar unirlos.",
      });
      return;
    }

    const merged = await mergeVideos(videos, mergeStrategy);
    if (merged) {
      setNotice({
        tone: "success",
        title: "Union completada",
        message: `El archivo final MP4 esta listo. Se proceso con ${merged.strategy === "fast" ? "modo rapido" : "modo compatible"}.`,
      });
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <section className="panel relative overflow-hidden px-6 py-8 sm:px-8 sm:py-10">
        <div className="absolute inset-x-0 top-0 h-28 bg-[radial-gradient(circle_at_top,rgba(15,23,42,0.1),transparent_70%)]" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div>
            <span className="badge mb-4 bg-slate-900 text-slate-50">
              Unir videos en el navegador
            </span>
            <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">
              Una app web moderna para combinar tus videos MP4 o MKV en el orden
              que elijas
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
              Sube varios archivos, revisa una vista previa, ajusta el orden
              final y genera una descarga unica sin salir de esta pagina.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">
              Flujo rapido
            </p>
            <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
              <li>1. Selecciona varios MP4 o MKV.</li>
              <li>2. Reordena la lista con subir y bajar.</li>
              <li>3. Presiona "Unir videos".</li>
              <li>4. Descarga el MP4 final.</li>
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

        {notice ? (
          <AlertBanner
            tone={notice.tone}
            title={notice.title}
            message={notice.message}
          />
        ) : null}

        {compatibilityWarnings.length > 0 ? (
          <div className="grid gap-3">
            {compatibilityWarnings.map((warning) => (
              <AlertBanner
                key={warning}
                tone="warning"
                title="Compatibilidad"
                message={warning}
              />
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
              clearVideos();
              setNotice({
                tone: "info",
                title: "Lista limpiada",
                message:
                  "Puedes volver a seleccionar otros videos cuando quieras.",
              });
            }}
          />
        ) : (
          <section className="panel p-10 text-center">
            <h2 className="text-2xl font-extrabold text-slate-950">
              Todavia no hay videos en la lista
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-600 sm:text-base">
              Empieza seleccionando uno o varios archivos MP4 o MKV. Luego
              podras cambiar el orden, eliminar elementos y generar el video
              final.
            </p>
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <ProgressCard
            progress={progress}
            isLoadingEngine={isLoadingEngine}
            isProcessing={isProcessing}
          />

          <div className="panel flex flex-col justify-between gap-4 p-6 sm:p-8">
            <div>
              <h2 className="text-xl font-extrabold text-slate-950">
                Acciones
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Cuando el orden este listo, inicia la union desde aqui.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge bg-slate-900 text-slate-50">Salida final: MP4</span>
                  <span className="badge">
                    {mergeStrategy === "fast" ? "Ruta automatica: rapida" : "Ruta automatica: compatible"}
                  </span>
                </div>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold text-slate-900">Modo automatico</p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Si todos los videos son MP4 compatibles, la app usa la ruta mas rapida. Si detecta diferencias de formato o resolucion, cambia sola a una ruta mas estable.
                  </p>
                </div>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  {mergeStrategy === "fast"
                    ? "Detecte que tu lista puede aprovechar la ruta rapida con unificacion de audio para mantener mejor compatibilidad."
                    : "Detecte que tu lista necesita conversion completa para mantener la union estable."}
                </p>
              </div>

              <button
                type="button"
                className="btn-primary w-full"
                onClick={handleMergeVideos}
                disabled={isProcessing}>
                {isProcessing
                  ? mergeStrategy === "fast"
                    ? "Uniendo con ruta rapida..."
                    : "Convirtiendo y uniendo videos..."
                  : "Unir videos"}
              </button>
              <p className="text-xs leading-5 text-slate-500">
                El resultado siempre saldra en MP4. El modo rapido evita la conversion para ahorrar tiempo cuando es posible.
              </p>
            </div>
          </div>
        </section>

        {result ? (
          <ResultCard
            result={result}
            onDownload={() => downloadFromUrl(result.url, result.fileName)}
          />
        ) : null}

        <footer className="panel mt-2 flex flex-col gap-4 px-6 py-5 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>Christopher 2026 - Hecho por mi. Todos los derechos reservados.</p>
          <a
            href="https://github.com/ChristopherMarreroL/UnirVideosWeb"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 font-semibold text-slate-900 transition hover:text-sky-700">
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-5 w-5 fill-current">
              <path d="M12 .5C5.65.5.5 5.66.5 12.02c0 5.09 3.3 9.4 7.87 10.92.58.11.79-.25.79-.56 0-.28-.01-1.2-.02-2.18-3.2.7-3.88-1.36-3.88-1.36-.52-1.34-1.28-1.69-1.28-1.69-1.05-.71.08-.69.08-.69 1.16.08 1.78 1.2 1.78 1.2 1.04 1.77 2.72 1.26 3.38.97.1-.75.4-1.26.73-1.54-2.56-.29-5.25-1.29-5.25-5.74 0-1.27.45-2.31 1.19-3.13-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.19 1.2a11.1 11.1 0 0 1 5.8 0c2.22-1.51 3.18-1.2 3.18-1.2.64 1.58.24 2.75.12 3.04.74.82 1.19 1.86 1.19 3.13 0 4.46-2.69 5.44-5.26 5.73.41.36.78 1.08.78 2.18 0 1.58-.02 2.86-.02 3.25 0 .31.21.68.8.56a11.53 11.53 0 0 0 7.86-10.92C23.5 5.66 18.34.5 12 .5Z" />
            </svg>
            GitHub
          </a>
        </footer>
      </div>
    </main>
  );
}

export default App;
