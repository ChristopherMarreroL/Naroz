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
        badge="Suite multimedia"
        title="Una base escalable para herramientas de video e imagen"
        description="La app ahora funciona como una plataforma modular. Cada herramienta vive en su propio modulo y la interfaz esta preparada para crecer sin perder claridad."
        aside={
          <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-slate-50 shadow-[0_24px_60px_-35px_rgba(15,23,42,0.85)]">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-300">Disponible hoy</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
              <li>1. Video / Unir videos</li>
              <li>2. Imagen / Convertir formato</li>
              <li>3. Base lista para sumar nuevas utilidades</li>
            </ul>
          </div>
        }
      />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="panel p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-950">Herramientas disponibles</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Entra a cada modulo desde aqui o desde la navegacion lateral.
              </p>
            </div>
            <span className="badge">2 activas</span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {availableTools.map((tool) => (
              <article key={tool.id} className="soft-border rounded-3xl bg-white p-5">
                <span className="badge">{tool.category}</span>
                <h3 className="mt-4 text-xl font-bold text-slate-950">{tool.title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-600">{tool.description}</p>
                <button type="button" className="btn-primary mt-5" onClick={() => onNavigate(tool.id)}>
                  Abrir herramienta
                </button>
              </article>
            ))}
          </div>
        </div>

        <section className="panel p-6 sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-extrabold text-slate-950">Proximamente</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">La arquitectura ya esta preparada para estas siguientes herramientas.</p>
            </div>
            <span className="badge bg-amber-100 text-amber-700">Roadmap</span>
          </div>

          <div className="mt-6 grid gap-3">
            {upcomingTools.map((tool) => (
              <div key={`${tool.category}-${tool.title}`} className="soft-border flex items-center justify-between rounded-2xl bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{tool.title}</p>
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
