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
    category: 'Video',
    title: 'Unir videos',
    description: 'Combina varios MP4 o MKV en un unico archivo final directamente en el navegador.',
  },
  {
    id: 'video-convert' as const,
    category: 'Video',
    title: 'Convertir formato',
    description: 'Convierte un solo video entre MP4 y MKV desde el navegador.',
  },
  {
    id: 'image-convert' as const,
    category: 'Imagen',
    title: 'Convertir formato',
    description: 'Transforma imagenes JPG, PNG y WebP con vista previa, metadatos y descarga inmediata.',
  },
  {
    id: 'video-extract-audio' as const,
    category: 'Video',
    title: 'Extraer audio',
    description: 'Separa el audio de un video MP4 o MKV y exportalo en MP3 o WAV desde el navegador.',
  },
  {
    id: 'document-merge-pdf' as const,
    category: 'Documento',
    title: 'Unir PDF',
    description: 'Combina varios PDF en un solo archivo final, reordenando cada documento antes de unirlo.',
  },
  {
    id: 'document-merge-docx' as const,
    category: 'Documento',
    title: 'Unir Word',
    description: 'Combina varios archivos DOCX en un solo documento Word con orden manual.',
  },
]

function getToolTitle(id: AppToolId, locale: 'es' | 'en') {
  if (id === 'video-merge') return locale === 'es' ? 'Unir videos' : 'Merge videos'
  if (id === 'video-convert') return locale === 'es' ? 'Convertir formato' : 'Convert format'
  if (id === 'video-extract-audio') return locale === 'es' ? 'Extraer audio' : 'Extract audio'
  if (id === 'document-merge-pdf') return locale === 'es' ? 'Unir PDF' : 'Merge PDF'
  if (id === 'document-merge-docx') return locale === 'es' ? 'Unir Word' : 'Merge Word'
  return locale === 'es' ? 'Convertir formato' : 'Convert format'
}

function getToolDescription(id: AppToolId, locale: 'es' | 'en') {
  if (id === 'video-merge') return locale === 'es' ? 'Combina varios MP4 o MKV en un unico archivo final directamente en el navegador.' : 'Combine multiple MP4 or MKV files into one final file directly in the browser.'
  if (id === 'video-convert') return locale === 'es' ? 'Convierte un solo video entre MP4 y MKV desde el navegador.' : 'Convert a single video between MP4 and MKV right in the browser.'
  if (id === 'video-extract-audio') return locale === 'es' ? 'Separa el audio de un video MP4 o MKV y exportalo en MP3 o WAV.' : 'Separate audio from an MP4 or MKV video and export it as MP3 or WAV.'
  if (id === 'document-merge-pdf') return locale === 'es' ? 'Combina varios PDF en un unico documento final y decide el orden antes de exportar.' : 'Combine multiple PDFs into one final document and choose the order before exporting.'
  if (id === 'document-merge-docx') return locale === 'es' ? 'Combina varios archivos DOCX en un solo documento Word desde el navegador.' : 'Combine multiple DOCX files into one Word document in the browser.'
  return locale === 'es' ? 'Transforma imagenes JPG, PNG, WebP, AVIF, GIF e ICO con vista previa y descarga inmediata.' : 'Convert JPG, PNG, WebP, AVIF, GIF, and ICO images with preview and instant download.'
}

const upcomingTools = [
  { id: 'video-trim' as const, category: 'Video', title: 'Recortar video' },
  { id: 'video-resize' as const, category: 'Video', title: 'Cambiar resolucion' },
  { category: 'Imagen', title: 'Redimensionar' },
  { category: 'Imagen', title: 'Comprimir / calidad' },
  { category: 'Documento', title: 'Convertir PDF a imagen' },
]

export function HomeView({ onNavigate }: HomeViewProps) {
  const { locale, t } = useLocale()

  return (
    <>
      <SectionHero
        badge={t('homeHeroBadge')}
        title={t('homeTitle')}
        description={t('homeDescription')}
      />

      <section className="panel -mt-2 p-4 sm:p-6 lg:-mt-3 lg:p-8">
        <h2 className="text-2xl font-extrabold text-slate-950">{t('homeIntroTitle')}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">{t('homeIntroDescription')}</p>
      </section>

      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="panel p-4 sm:p-6 lg:p-8">
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
                  <span className="badge">{tool.category === 'Video' ? t('video') : tool.category === 'Imagen' ? t('image') : t('document')}</span>
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
        </div>

        <section className="panel p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-950">{t('homeUpcoming')}</h2>
            </div>
            <span className="badge bg-amber-100 text-amber-700">Roadmap</span>
          </div>

          <div className="mt-5 grid min-w-0 gap-3">
            {upcomingTools.map((tool) => (
              <button
                key={`${tool.category}-${tool.title}`}
                type="button"
                onClick={() => {
                  if ('id' in tool && tool.id) {
                    onNavigate(tool.id as AppToolId)
                  }
                }}
                className="panel-subtle min-w-0 flex flex-col items-start justify-between gap-3 px-4 py-3 text-left transition hover:border-slate-300 sm:flex-row sm:items-center"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-slate-900">{tool.title}</p>
                  <p className="text-xs text-slate-500">{tool.category === 'Video' ? t('video') : tool.category === 'Imagen' ? t('image') : t('document')}</p>
                </div>
                <span className="badge bg-slate-100 text-slate-500">{t('homeUpcoming')}</span>
              </button>
            ))}
          </div>
        </section>
      </section>
    </>
  )
}
