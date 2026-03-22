import { useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { SectionHero } from '../../components/shared/SectionHero'
import { downloadFromUrl } from '../../lib/download'
import { formatBytes } from '../../lib/format'
import { convertImageFile, getImageExtensionLabel, isSupportedImageType } from './lib/imageConverter'
import type { ConvertedImageResult, ImageOutputFormat, ImageUploadState } from './types'

type NoticeTone = 'error' | 'warning' | 'success' | 'info'

interface Notice {
  tone: NoticeTone
  title: string
  message: string
}

const OUTPUT_OPTIONS: Array<{ value: ImageOutputFormat; label: string }> = [
  { value: 'jpeg', label: 'JPG / JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'webp', label: 'WebP' },
]

function loadImagePreview(file: File): Promise<ImageUploadState> {
  return new Promise((resolve, reject) => {
    const previewUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve({
        file,
        previewUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
      })
    }
    image.onerror = () => {
      URL.revokeObjectURL(previewUrl)
      reject(new Error('No se pudo cargar la imagen seleccionada.'))
    }
    image.src = previewUrl
  })
}

export function ImageConvertView() {
  const [upload, setUpload] = useState<ImageUploadState | null>(null)
  const [outputFormat, setOutputFormat] = useState<ImageOutputFormat>('webp')
  const [result, setResult] = useState<ConvertedImageResult | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [notice, setNotice] = useState<Notice | null>({
    tone: 'info',
    title: 'Conversion local',
    message: 'La imagen se convierte localmente en tu navegador usando canvas para priorizar una implementacion simple y estable.',
  })

  const sourceLabel = useMemo(() => {
    if (!upload) {
      return null
    }

    return getImageExtensionLabel(upload.file)
  }, [upload])

  const clearResult = () => {
    setResult((current) => {
      if (current?.url) {
        URL.revokeObjectURL(current.url)
      }

      return null
    })
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    clearResult()

    if (!isSupportedImageType(file)) {
      setNotice({
        tone: 'error',
        title: 'Formato no soportado',
        message: 'Esta herramienta acepta imagenes JPG, PNG y WebP en esta primera etapa.',
      })
      return
    }

    try {
      setUpload((current) => {
        if (current?.previewUrl) {
          URL.revokeObjectURL(current.previewUrl)
        }

        return current
      })

      const nextUpload = await loadImagePreview(file)
      setUpload(nextUpload)
      setNotice({
        tone: 'success',
        title: 'Imagen cargada',
        message: 'Ya puedes elegir el formato de salida y convertirla.',
      })
    } catch (error) {
      setNotice({
        tone: 'error',
        title: 'No se pudo cargar la imagen',
        message: error instanceof Error ? error.message : 'Ocurrio un error al leer la imagen.',
      })
    }
  }

  const handleConvert = async () => {
    if (!upload) {
      setNotice({
        tone: 'error',
        title: 'Falta una imagen',
        message: 'Selecciona primero una imagen JPG, PNG o WebP.',
      })
      return
    }

    setIsConverting(true)
    clearResult()

    try {
      const converted = await convertImageFile(upload.file, outputFormat)
      setResult(converted)
      setNotice({
        tone: 'success',
        title: 'Conversion completada',
        message: `La imagen ya esta lista en formato ${outputFormat.toUpperCase()}.`,
      })
    } catch (error) {
      setNotice({
        tone: 'error',
        title: 'No se pudo convertir la imagen',
        message: error instanceof Error ? error.message : 'La conversion fallo por una razon desconocida.',
      })
    } finally {
      setIsConverting(false)
    }
  }

  return (
    <>
      <SectionHero
        badge="Imagen / Convertir formato"
        title="Convierte imagenes entre JPG, PNG y WebP desde una vista simple y clara"
        description="Sube una imagen, revisa su informacion, elige el formato de salida y descarga el resultado convertido desde la misma suite."
        aside={
          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">Formatos iniciales</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
              <li>1. Entrada: JPG, PNG, WebP</li>
              <li>2. Salida: JPG, PNG, WebP</li>
              <li>3. Conversion estable con canvas</li>
            </ul>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel p-6 sm:p-8">
          <div className="flex flex-col gap-5 border-b border-slate-100 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-950">Cargar imagen</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">Esta herramienta esta pensada para conversiones directas y realistas en frontend.</p>
            </div>

            <label className="btn-primary cursor-pointer">
              Seleccionar imagen
              <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileChange} />
            </label>
          </div>

          {notice ? <div className="mt-6"><AlertBanner tone={notice.tone} title={notice.title} message={notice.message} /></div> : null}

          {upload ? (
            <div className="mt-6 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-100">
                <img src={upload.previewUrl} alt={upload.file.name} className="h-full w-full object-contain" />
              </div>

              <div className="grid gap-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="soft-border rounded-2xl bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Nombre</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{upload.file.name}</p>
                  </div>
                  <div className="soft-border rounded-2xl bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Tamano</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{formatBytes(upload.file.size)}</p>
                  </div>
                  <div className="soft-border rounded-2xl bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Formato</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{sourceLabel}</p>
                  </div>
                  <div className="soft-border rounded-2xl bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Resolucion</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{upload.width}x{upload.height}</p>
                  </div>
                </div>

                <div className="soft-border rounded-3xl bg-white p-5">
                  <label className="text-sm font-semibold text-slate-900" htmlFor="output-format">Formato de salida</label>
                  <select
                    id="output-format"
                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
                    value={outputFormat}
                    onChange={(event) => setOutputFormat(event.target.value as ImageOutputFormat)}
                  >
                    {OUTPUT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>

                  {outputFormat === 'jpeg' && sourceLabel === 'PNG' ? (
                    <div className="mt-4">
                      <AlertBanner
                        tone="warning"
                        title="Transparencia"
                        message="Si la imagen tiene transparencia, al convertirla a JPG se rellenara con fondo blanco."
                      />
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button type="button" className="btn-primary" onClick={handleConvert} disabled={isConverting}>
                      {isConverting ? 'Convirtiendo...' : 'Convertir imagen'}
                    </button>
                    {result ? (
                      <button type="button" className="btn-secondary" onClick={() => downloadFromUrl(result.url, result.fileName)}>
                        Descargar imagen convertida
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
              <h3 className="text-xl font-bold text-slate-950">Todavia no has cargado una imagen</h3>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-600">
                Selecciona una imagen JPG, PNG o WebP para ver su vista previa, elegir un formato de salida y convertirla.
              </p>
            </div>
          )}
        </section>

        <section className="panel p-6 sm:p-8">
          <h2 className="text-2xl font-extrabold text-slate-950">Estado de conversion</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">La conversion de imagen usa APIs del navegador, por lo que es inmediata en casos sencillos.</p>

          <div className="mt-6 grid gap-4">
            <div className="soft-border rounded-2xl bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Salida final</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{outputFormat.toUpperCase()}</p>
            </div>
            <div className="soft-border rounded-2xl bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Compatibilidad</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">Sin SVG en esta etapa para mantener una conversion tecnicamente correcta y estable.</p>
            </div>
            {result ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">Archivo listo</p>
                <p className="mt-2 text-sm leading-6 text-emerald-700">{result.fileName} · {formatBytes(result.size)}</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </>
  )
}
