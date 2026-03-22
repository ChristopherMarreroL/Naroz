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
]

function getToolTitle(id: AppToolId, locale: 'es' | 'en') {
  if (id === 'video-merge') return locale === 'es' ? 'Unir videos' : 'Merge videos'
  if (id === 'video-convert') return locale === 'es' ? 'Convertir formato' : 'Convert format'
  return locale === 'es' ? 'Convertir formato' : 'Convert format'
}

function getToolDescription(id: AppToolId, locale: 'es' | 'en') {
  if (id === 'video-merge') return locale === 'es' ? 'Combina varios MP4 o MKV en un unico archivo final directamente en el navegador.' : 'Combine multiple MP4 or MKV files into one final file directly in the browser.'
  if (id === 'video-convert') return locale === 'es' ? 'Convierte un solo video entre MP4 y MKV desde el navegador.' : 'Convert a single video between MP4 and MKV right in the browser.'
  return locale === 'es' ? 'Transforma imagenes JPG, PNG, WebP, AVIF, GIF e ICO con vista previa y descarga inmediata.' : 'Convert JPG, PNG, WebP, AVIF, GIF, and ICO images with preview and instant download.'
}

const upcomingTools = [
  { id: 'video-trim' as const, category: 'Video', title: 'Recortar video' },
  { id: 'video-extract-audio' as const, category: 'Video', title: 'Extraer audio' },
  { id: 'video-resize' as const, category: 'Video', title: 'Cambiar resolucion' },
  { category: 'Imagen', title: 'Redimensionar' },
  { category: 'Imagen', title: 'Comprimir / calidad' },
]

export function HomeView({ onNavigate }: HomeViewProps) {
  const { locale, t } = useLocale()

  return (
    <>
      <SectionHero
        badge="Naroz"
        title={t('homeTitle')}
        description={t('homeDescription')}
        aside={
          <div className="w-full max-w-full rounded-[1.5rem] border border-slate-900/10 bg-slate-950 p-4 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)] sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">{t('today')}</p>
            <div className="mt-4 grid gap-3 text-sm text-slate-200">
              <div className="rounded-2xl bg-white/8 px-4 py-3">
                <p className="font-semibold">{locale === 'es' ? 'Unir videos' : 'Merge videos'}</p>
                <p className="mt-1 text-xs text-slate-300">{locale === 'es' ? 'MP4 y MKV con salida inteligente' : 'MP4 and MKV with smart output selection'}</p>
              </div>
              <div className="rounded-2xl bg-white/8 px-4 py-3">
                <p className="font-semibold">{locale === 'es' ? 'Convertir video' : 'Convert video'}</p>
                <p className="mt-1 text-xs text-slate-300">{locale === 'es' ? 'Un solo archivo a MP4 o MKV' : 'Single file conversion to MP4 or MKV'}</p>
              </div>
              <div className="rounded-2xl bg-white/8 px-4 py-3">
                <p className="font-semibold">{locale === 'es' ? 'Convertir imagenes' : 'Convert images'}</p>
                <p className="mt-1 text-xs text-slate-300">JPG, PNG, WebP, AVIF, GIF {locale === 'es' ? 'e' : 'and'} ICO</p>
              </div>
            </div>
          </div>
        }
      />

      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="panel p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-950">{t('homeAvailable')}</h2>
            </div>
            <span className="badge">3 {t('activeCount')}</span>
          </div>

          <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {availableTools.map((tool) => (
              <article key={tool.id} className="panel-subtle min-w-0 p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="badge">{tool.category === 'Video' ? t('video') : t('image')}</span>
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
                  <p className="text-xs text-slate-500">{tool.category === 'Video' ? t('video') : t('image')}</p>
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
