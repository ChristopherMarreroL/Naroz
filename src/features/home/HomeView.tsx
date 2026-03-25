import type { AppToolId } from '../../types/app'
import { useLocale } from '../../i18n/LocaleProvider'
import { SectionHero } from '../../components/shared/SectionHero'
import { ToolIcon } from '../../components/shared/ToolIcon'

interface HomeViewProps {
  onNavigate: (tool: AppToolId) => void
}

const availableTools = [
  {
    id: 'video-merge' as const,
    category: 'video',
    status: 'stable',
  },
  {
    id: 'video-convert' as const,
    category: 'video',
    status: 'stable',
  },
  {
    id: 'image-convert' as const,
    category: 'image',
    status: 'stable',
  },
  {
    id: 'image-remove-background' as const,
    category: 'image',
    status: 'beta',
  },
  {
    id: 'image-crop' as const,
    category: 'image',
    status: 'stable',
  },
  {
    id: 'image-transform' as const,
    category: 'image',
    status: 'stable',
  },
  {
    id: 'video-extract-audio' as const,
    category: 'video',
    status: 'stable',
  },
  {
    id: 'video-remove-audio' as const,
    category: 'video',
    status: 'stable',
  },
  {
    id: 'document-merge-pdf' as const,
    category: 'document',
    status: 'stable',
  },
  {
    id: 'document-delete-pages' as const,
    category: 'document',
    status: 'beta',
  },
  {
    id: 'document-merge-docx' as const,
    category: 'document',
    status: 'beta',
  },
  {
    id: 'video-trim' as const,
    category: 'video',
    status: 'beta',
  },
]

function getToolTitle(id: AppToolId, locale: 'es' | 'en') {
  if (id === 'video-merge') return locale === 'es' ? 'Unir videos' : 'Merge videos'
  if (id === 'video-convert') return locale === 'es' ? 'Convertir formato' : 'Convert format'
  if (id === 'video-extract-audio') return locale === 'es' ? 'Extraer audio' : 'Extract audio'
  if (id === 'video-remove-audio') return locale === 'es' ? 'Eliminar audio' : 'Remove audio'
  if (id === 'video-trim') return locale === 'es' ? 'Recortar video' : 'Trim video'
  if (id === 'image-crop') return locale === 'es' ? 'Recortar imagen' : 'Crop image'
  if (id === 'image-transform') return locale === 'es' ? 'Rotar / voltear imagen' : 'Rotate / flip image'
  if (id === 'image-remove-background') return locale === 'es' ? 'Remover fondo' : 'Remove background'
  if (id === 'document-merge-pdf') return locale === 'es' ? 'Unir PDF' : 'Merge PDF'
  if (id === 'document-delete-pages') return locale === 'es' ? 'Eliminar paginas' : 'Delete pages'
  if (id === 'document-merge-docx') return locale === 'es' ? 'Unir Word' : 'Merge Word'
  return locale === 'es' ? 'Convertir formato' : 'Convert format'
}

function getToolDescription(id: AppToolId, locale: 'es' | 'en') {
  if (id === 'video-merge') return locale === 'es' ? 'Combina varios MP4 o MKV en un unico archivo final directamente en el navegador.' : 'Combine multiple MP4 or MKV files into one final file directly in the browser.'
  if (id === 'video-convert') return locale === 'es' ? 'Convierte un solo video entre MP4 y MKV desde el navegador.' : 'Convert a single video between MP4 and MKV right in the browser.'
  if (id === 'video-extract-audio') return locale === 'es' ? 'Separa el audio de un video MP4 o MKV y exportalo en MP3 o WAV.' : 'Separate audio from an MP4 or MKV video and export it as MP3 or WAV.'
  if (id === 'video-remove-audio') return locale === 'es' ? 'Genera una copia silenciosa de un video MP4 o MKV sin tocar la imagen.' : 'Generate a silent copy of an MP4 or MKV video without changing the picture.'
  if (id === 'video-trim') return locale === 'es' ? 'Recorta un fragmento de un video MP4 o MKV y exporta solo el tramo que necesitas.' : 'Trim one segment from an MP4 or MKV video and export only the clip you need.'
  if (id === 'image-crop') return locale === 'es' ? 'Recorta una imagen y exporta solo el area que necesitas sin salir del navegador.' : 'Crop one image and export only the area you need directly in the browser.'
  if (id === 'image-transform') return locale === 'es' ? 'Rota una imagen o volteala horizontal y verticalmente antes de descargarla.' : 'Rotate an image or flip it horizontally and vertically before downloading it.'
  if (id === 'image-remove-background') return locale === 'es' ? 'Intenta quitar fondos lisos o uniformes y exporta la imagen en PNG con transparencia.' : 'Attempts to remove plain or uniform backgrounds and exports the image as a transparent PNG.'
  if (id === 'document-merge-pdf') return locale === 'es' ? 'Combina varios PDF en un unico documento final y decide el orden antes de exportar.' : 'Combine multiple PDFs into one final document and choose the order before exporting.'
  if (id === 'document-delete-pages') return locale === 'es' ? 'Selecciona un PDF y elimina paginas especificas antes de descargar una nueva version.' : 'Pick a PDF and remove specific pages before downloading a new version.'
  if (id === 'document-merge-docx') return locale === 'es' ? 'Combina varios archivos DOCX en un solo documento Word desde el navegador.' : 'Combine multiple DOCX files into one Word document in the browser.'
  return locale === 'es' ? 'Transforma imagenes JPG, PNG, WebP, AVIF, GIF e ICO con vista previa y descarga inmediata.' : 'Convert JPG, PNG, WebP, AVIF, GIF, and ICO images with preview and instant download.'
}

export function HomeView({ onNavigate }: HomeViewProps) {
  const { locale, t } = useLocale()

  return (
    <>
      <SectionHero
        badge={t('homeHeroBadge')}
        title={t('homeTitle')}
        description={t('homeDescription')}
      />

      <section className="panel p-4 sm:p-6 lg:p-8">
        <h2 className="text-2xl font-extrabold text-slate-950">{t('homeIntroTitle')}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">{t('homeIntroDescription')}</p>
      </section>

      <section className="panel p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-950">{t('homeAvailable')}</h2>
          </div>
          <span className="badge">{availableTools.length} {t('activeCount')}</span>
        </div>

        <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {availableTools.map((tool) => (
            <article key={tool.id} className="panel-subtle min-w-0 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge">{tool.category === 'video' ? t('video') : tool.category === 'image' ? t('image') : t('document')}</span>
                  {tool.status === 'beta' ? <span className="badge bg-sky-100 text-sky-700">{t('betaBadge')}</span> : null}
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <ToolIcon toolId={tool.id} />
                </div>
              </div>
              <h3 className="mt-4 text-xl font-bold text-slate-950">{getToolTitle(tool.id, locale)}</h3>
              <p className="mt-2 break-words text-sm leading-6 text-slate-600">{getToolDescription(tool.id, locale)}</p>
              <button type="button" className="btn-primary mt-4 w-full sm:w-auto" onClick={() => onNavigate(tool.id)}>
                {t('openTool')}
              </button>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
