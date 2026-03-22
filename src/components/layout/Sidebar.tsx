import type { AppSectionId, AppToolId, SidebarItem } from '../../types/app'

interface SidebarProps {
  items: SidebarItem[]
  activeTool: AppToolId
  activeSection: AppSectionId
  onNavigate: (tool: AppToolId) => void
}

const sectionLabels: Record<AppSectionId, string> = {
  general: 'General',
  video: 'Video',
  image: 'Imagen',
}

export function Sidebar({ items, activeTool, activeSection, onNavigate }: SidebarProps) {
  return (
    <aside className="panel hidden min-h-full flex-col overflow-hidden lg:flex">
      <div className="border-b border-slate-100/80 px-6 py-7">
        <div className="inline-flex items-center rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-slate-50">
          Naroz
        </div>
        <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-950">Naroz</h1>
        <p className="mt-3 max-w-xs text-sm leading-7 text-slate-600">
          Una plataforma modular para editar y convertir contenido multimedia desde el navegador.
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-6 px-4 py-6">
        {(['general', 'video', 'image'] as AppSectionId[]).map((section) => {
          const sectionItems = items.filter((item) => item.section === section)

          return (
            <section key={section}>
              <div className="mb-3 px-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                {sectionLabels[section]}
              </div>

              <div className="grid gap-2">
                {sectionItems.map((item) => {
                  const isActive = item.id === activeTool

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onNavigate(item.id)}
                      className={`tool-nav-item ${isActive ? 'tool-nav-item-active' : ''}`}
                    >
                      <span className="text-left">
                        <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span>
                      </span>
                      {isActive || activeSection === item.section ? (
                        <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${isActive ? 'bg-slate-900 text-slate-50' : 'bg-slate-100 text-slate-500'}`}>
                          {isActive ? 'Activa' : 'Seccion'}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <div className="border-t border-slate-100/80 bg-slate-50/70 px-6 py-5 text-sm text-slate-500">
        Base lista para sumar conversion, recorte, compresion y mas herramientas.
      </div>
    </aside>
  )
}
