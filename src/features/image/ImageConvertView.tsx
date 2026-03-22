import { useMemo, useState } from 'react'

import { AlertBanner } from '../../components/shared/AlertBanner'
import { EmptyState } from '../../components/shared/EmptyState'
import { SectionHero } from '../../components/shared/SectionHero'
import { useLocale } from '../../i18n/LocaleProvider'
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
  { value: 'avif', label: 'AVIF' },
  { value: 'gif', label: 'GIF' },
  { value: 'ico', label: 'ICO' },
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
  const { locale, t } = useLocale()
  const [upload, setUpload] = useState<ImageUploadState | null>(null)
  const [outputFormat, setOutputFormat] = useState<ImageOutputFormat>('webp')
  const [result, setResult] = useState<ConvertedImageResult | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [notice, setNotice] = useState<Notice | null>({
    tone: 'info',
    title: t('localConversion'),
    message:
      locale === 'es'
        ? 'La imagen se convierte localmente en tu navegador usando canvas para priorizar una implementacion simple y estable.'
        : 'The image is converted locally in your browser using canvas for a simple and stable implementation.',
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
        title: t('unsupportedImage'),
        message:
          locale === 'es'
            ? 'Esta herramienta acepta imagenes JPG, PNG y WebP como entrada en esta etapa.'
            : 'This tool currently accepts JPG, PNG, and WebP images as input.',
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
        title: t('imageLoaded'),
        message:
          locale === 'es'
            ? 'Ya puedes elegir el formato de salida y convertirla.'
            : 'You can now choose the output format and convert it.',
      })
    } catch (error) {
      setNotice({
        tone: 'error',
        title: locale === 'es' ? 'No se pudo cargar la imagen' : 'Could not load image',
        message: error instanceof Error ? error.message : locale === 'es' ? 'Ocurrio un error al leer la imagen.' : 'An unknown error occurred while reading the image.',
      })
    }
  }

  const handleConvert = async () => {
    if (!upload) {
      setNotice({
        tone: 'error',
        title: t('imageMissing'),
        message: locale === 'es' ? 'Selecciona primero una imagen JPG, PNG o WebP.' : 'Select a JPG, PNG, or WebP image first.',
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
        title: t('conversionCompleted'),
        message:
          locale === 'es'
            ? `La imagen ya esta lista en formato ${outputFormat.toUpperCase()}.`
            : `The image is now ready in ${outputFormat.toUpperCase()} format.`,
      })
    } catch (error) {
      setNotice({
        tone: 'error',
        title: locale === 'es' ? 'No se pudo convertir la imagen' : 'Could not convert image',
        message: error instanceof Error ? error.message : locale === 'es' ? 'La conversion fallo por una razon desconocida.' : 'The conversion failed for an unknown reason.',
      })
    } finally {
      setIsConverting(false)
    }
  }

  return (
    <>
      <SectionHero
        badge={locale === 'es' ? 'Imagen / Convertir formato' : 'Image / Convert format'}
        title={t('imageHeroTitle')}
        description={t('imageHeroDesc')}
        aside={
          <div className="rounded-[1.6rem] border border-slate-900/10 bg-slate-950 p-5 text-slate-50 shadow-[0_26px_60px_-34px_rgba(15,23,42,0.78)] sm:p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">{t('formatsAvailable')}</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
              <li>{locale === 'es' ? '1. Entrada: JPG, PNG, WebP' : '1. Input: JPG, PNG, WebP'}</li>
              <li>{locale === 'es' ? '2. Salida: JPG, PNG, WebP, AVIF, GIF, ICO' : '2. Output: JPG, PNG, WebP, AVIF, GIF, ICO'}</li>
              <li>3. {t('realConversion')}</li>
            </ul>
          </div>
        }
      />

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="panel p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-950">{t('loadImage')}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{t('imageConvertDesc')}</p>
            </div>

            <label className="btn-primary w-full cursor-pointer justify-center sm:w-auto">
              {t('selectImage')}
              <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" className="hidden" onChange={handleFileChange} />
            </label>
          </div>

          {notice ? <div className="mt-6"><AlertBanner tone={notice.tone} title={notice.title} message={notice.message} /></div> : null}

          {upload ? (
            <div className="mt-6 grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-6">
              <div className="panel-subtle overflow-hidden p-3">
                <div className="overflow-hidden rounded-[1.2rem] bg-slate-100">
                  <img src={upload.previewUrl} alt={upload.file.name} className="aspect-square h-full w-full object-contain sm:aspect-[4/3]" />
                </div>
              </div>

              <div className="grid gap-5">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('name')}</p>
                    <p className="mt-2 break-words text-sm font-semibold text-slate-900">{upload.file.name}</p>
                  </div>
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('size')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{formatBytes(upload.file.size)}</p>
                  </div>
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('format')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{sourceLabel}</p>
                  </div>
                  <div className="panel-subtle p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('resolution')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{upload.width}x{upload.height}</p>
                  </div>
                </div>

                <div className="panel-subtle p-5 sm:p-6">
                  <label className="text-sm font-semibold text-slate-900" htmlFor="output-format">{t('outputFormat')}</label>
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
                        title={locale === 'es' ? 'Transparencia' : 'Transparency'}
                        message={locale === 'es' ? 'Si la imagen tiene transparencia, al convertirla a JPG se rellenara con fondo blanco.' : 'If the image contains transparency, converting to JPG will fill it with a white background.'}
                      />
                    </div>
                  ) : null}

                  {outputFormat === 'gif' ? (
                    <div className="mt-4">
                      <AlertBanner
                        tone="info"
                        title={locale === 'es' ? 'GIF estatico' : 'Static GIF'}
                        message={locale === 'es' ? 'Esta conversion genera un GIF de una sola imagen. No crea animaciones a partir de imagenes fijas.' : 'This conversion generates a single-frame GIF. It does not create animations from still images.'}
                      />
                    </div>
                  ) : null}

                  {outputFormat === 'ico' ? (
                    <div className="mt-4">
                      <AlertBanner
                        tone="info"
                        title={locale === 'es' ? 'ICO para iconos' : 'ICO for icons'}
                        message={locale === 'es' ? 'La imagen se convierte realmente a ICO y se adapta a un lienzo cuadrado para funcionar mejor como icono.' : 'The image is truly converted to ICO and adapted to a square canvas to work better as an icon.'}
                      />
                    </div>
                  ) : null}

                  {outputFormat === 'avif' ? (
                    <div className="mt-4">
                      <AlertBanner
                        tone="info"
                        title={locale === 'es' ? 'AVIF depende del navegador' : 'AVIF depends on the browser'}
                        message={locale === 'es' ? 'Si tu navegador no soporta exportar AVIF, la app mostrara un error claro en lugar de darte un archivo incorrecto.' : 'If your browser does not support AVIF export, the app will show a clear error instead of giving you an incorrect file.'}
                      />
                    </div>
                  ) : null}

                  {outputFormat === 'webp' ? (
                    <div className="mt-4">
                      <AlertBanner
                        tone="info"
                        title={locale === 'es' ? 'WebP depende del dispositivo' : 'WebP depends on the device'}
                        message={locale === 'es' ? 'En algunos moviles el navegador puede abrir WebP pero no exportarlo correctamente. Si pasa eso, la app cancelara la descarga y mostrara un error claro.' : 'On some mobile devices the browser can read WebP but cannot export it correctly. If that happens, the app will stop the download and show a clear error.'}
                      />
                    </div>
                  ) : null}

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    <button type="button" className="btn-primary w-full sm:w-auto" onClick={handleConvert} disabled={isConverting}>
                      {isConverting ? t('converting') : locale === 'es' ? 'Convertir imagen' : 'Convert image'}
                    </button>
                    {result ? (
                      <button type="button" className="btn-secondary w-full sm:w-auto" onClick={() => downloadFromUrl(result.url, result.fileName)}>
                        {locale === 'es' ? 'Descargar imagen convertida' : 'Download converted image'}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState
                badge={t('noImage')}
                title={t('emptyImageTitle')}
                description={locale === 'es' ? 'Selecciona una imagen JPG, PNG o WebP para ver su vista previa, elegir un formato de salida y convertirla.' : 'Select a JPG, PNG, or WebP image to preview it, choose an output format, and convert it.'}
              />
            </div>
          )}
        </section>

        <section className="panel p-4 sm:p-6 lg:p-8">
          <h2 className="text-2xl font-extrabold text-slate-950">{t('imageStatus')}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t('imageStatusDesc')}</p>

          <div className="mt-6 grid gap-4">
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('targetOutput')}</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">{outputFormat.toUpperCase()}</p>
            </div>
            <div className="panel-subtle p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{t('compatibility')}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {locale === 'es'
                  ? 'JPG, PNG, WebP, AVIF, GIF e ICO salen realmente en el formato elegido. SVG sigue fuera para mantener conversiones correctas.'
                  : 'JPG, PNG, WebP, AVIF, GIF, and ICO are exported in the selected format. SVG stays out for technically correct conversions.'}
              </p>
            </div>
            {result ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <p className="text-sm font-semibold text-emerald-700">{t('outputReady')}</p>
                <p className="mt-2 text-sm leading-6 text-emerald-700">{result.fileName} · {formatBytes(result.size)}</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </>
  )
}
