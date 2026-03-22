import type { AppToolId, SidebarItem } from '../../types/app'

interface MobileToolNavProps {
  items: SidebarItem[]
  activeTool: AppToolId
  onNavigate: (tool: AppToolId) => void
}

export function MobileToolNav({ items, activeTool, onNavigate }: MobileToolNavProps) {
  return (
    <section className="panel p-4 lg:hidden">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Naroz</p>
          <p className="mt-1 text-sm text-slate-600">Navegacion rapida para movil</p>
        </div>

        <div className="badge bg-slate-900 text-slate-50">Salida local</div>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
            className={`whitespace-nowrap rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
              item.id === activeTool
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  )
}
