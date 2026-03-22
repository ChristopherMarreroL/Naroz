import { useState } from 'react'

import type { AppToolId, SidebarItem } from '../../types/app'

interface MobileToolNavProps {
  items: SidebarItem[]
  activeTool: AppToolId
  onNavigate: (tool: AppToolId) => void
}

export function MobileToolNav({ items, activeTool, onNavigate }: MobileToolNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const activeLabel = items.find((item) => item.id === activeTool)?.label ?? 'Inicio'

  return (
    <section className="panel relative z-40 overflow-visible p-3 sm:p-4 lg:hidden">
      <div className="relative flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label="Abrir navegacion"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-900"
          onClick={() => setIsOpen((current) => !current)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-current">
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        </button>

        <div className="min-w-0 flex-1 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">Naroz</p>
          <p className="mt-1 truncate text-sm font-medium text-slate-700">{activeLabel}</p>
        </div>

        <div className="badge shrink-0 px-2 py-1 text-[11px] bg-slate-900 text-slate-50">Web</div>

        {isOpen ? (
          <div className="absolute left-0 top-[calc(100%+0.75rem)] z-50 w-[min(18rem,calc(100vw-2rem))] rounded-[1.4rem] border border-slate-200 bg-white p-3 shadow-[0_30px_60px_-30px_rgba(15,23,42,0.35)]">
            <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">Herramientas</div>
            <div className="grid gap-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onNavigate(item.id)
                    setIsOpen(false)
                  }}
                  className={`rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                    item.id === activeTool ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-800'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
