import type { AppToolId } from '../../types/app'
import { SectionHero } from '../../components/shared/SectionHero'

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
    id: 'image-convert' as const,
    category: 'Imagen',
    title: 'Convertir formato',
    description: 'Transforma imagenes JPG, PNG y WebP con vista previa, metadatos y descarga inmediata.',
  },
]

const upcomingTools = [
  { category: 'Video', title: 'Convertir formato' },
  { category: 'Video', title: 'Recortar video' },
  { category: 'Video', title: 'Extraer audio' },
  { category: 'Imagen', title: 'Redimensionar' },
  { category: 'Imagen', title: 'Comprimir' },
  { category: 'Imagen', title: 'Cambiar calidad' },
]

export function HomeView({ onNavigate }: HomeViewProps) {
  return (
    <>
      <SectionHero
        badge="Naroz"
        title="Video e imagen, en un solo lugar"
        description="Elige una herramienta y empieza desde el navegador."
        aside={
          <div className="w-full max-w-full rounded-[1.5rem] border border-slate-900/10 bg-slate-950 p-4 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)] sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-300">Disponible</p>
            <div className="mt-3 grid gap-2 text-sm text-slate-200">
              <div className="rounded-2xl bg-white/8 px-3 py-2.5 break-words">Unir videos</div>
              <div className="rounded-2xl bg-white/8 px-3 py-2.5 break-words">Convertir imagen</div>
            </div>
          </div>
        }
      />

      <section className="grid min-w-0 gap-4 sm:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="panel p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-950">Herramientas disponibles</h2>
            </div>
            <span className="badge">2 activas</span>
          </div>

          <div className="mt-5 grid min-w-0 gap-3 md:grid-cols-2">
            {availableTools.map((tool) => (
              <article key={tool.id} className="panel-subtle min-w-0 p-5">
                <span className="badge">{tool.category}</span>
                <h3 className="mt-4 text-xl font-bold text-slate-950">{tool.title}</h3>
                <p className="mt-2 break-words text-sm leading-6 text-slate-600">{tool.description}</p>
                <button type="button" className="btn-primary mt-4 w-full sm:w-auto" onClick={() => onNavigate(tool.id)}>
                  Abrir herramienta
                </button>
              </article>
            ))}
          </div>
        </div>

        <section className="panel p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-950">Proximamente</h2>
            </div>
            <span className="badge bg-amber-100 text-amber-700">Roadmap</span>
          </div>

          <div className="mt-5 grid min-w-0 gap-3">
            {upcomingTools.map((tool) => (
              <div key={`${tool.category}-${tool.title}`} className="panel-subtle min-w-0 flex flex-col items-start justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold text-slate-900">{tool.title}</p>
                  <p className="text-xs text-slate-500">{tool.category}</p>
                </div>
                <span className="badge bg-slate-100 text-slate-500">Proximamente</span>
              </div>
            ))}
          </div>
        </section>
      </section>
    </>
  )
}
