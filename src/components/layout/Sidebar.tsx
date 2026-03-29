import type { AppSectionId, AppToolId, SidebarItem } from '../../types/app'
import { useLocale } from '../../i18n/LocaleProvider'
import narozLogo from '../../assets/naroz-logo.svg'
import { ToolIcon } from '../shared/ToolIcon'

interface SidebarProps {
  items: SidebarItem[]
  activeTool: AppToolId
  activeSection: AppSectionId
  onNavigate: (tool: AppToolId) => void
  onClose: () => void
}

export function Sidebar({ items, activeTool, activeSection, onNavigate, onClose }: SidebarProps) {
  const { locale, t } = useLocale()
  const sectionLabels: Record<AppSectionId, string> = {
    general: t('general'),
    video: t('video'),
    image: t('image'),
    document: t('document'),
  }

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="border-b border-slate-100/80 px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-3 rounded-[1.6rem] border border-slate-200 bg-slate-50 px-3 py-2">
              <img src={narozLogo} alt="Naroz logo" className="h-10 w-10 rounded-2xl bg-white object-contain p-1.5 shadow-[0_12px_24px_-18px_rgba(15,23,42,0.5)]" />
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em] text-slate-400">Brand</p>
                <p className="text-sm font-bold text-slate-900">Naroz</p>
              </div>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-7 text-slate-600">{t('brandTagline')}</p>
          </div>

          <button
            type="button"
            aria-label={locale === 'es' ? 'Cerrar navegacion' : 'Close navigation'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.9">
              <path d="M6 6 18 18M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4 py-6">
        {(['general', 'video', 'image', 'document'] as AppSectionId[]).map((section) => {
          const sectionItems = items.filter((item) => item.section === section)

          return (
            <section key={section}>
              <div className="mb-3 px-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                {sectionLabels[section]}
              </div>

              <div className="grid gap-2">
                {sectionItems.map((item) => {
                  const isActive = item.id === activeTool
                  const badgeClass =
                    item.status === 'soon'
                      ? 'bg-amber-100 text-amber-700'
                      : item.status === 'beta'
                        ? 'bg-sky-100 text-sky-700'
                        : isActive
                          ? 'bg-slate-900 text-slate-50'
                          : activeSection === item.section
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-transparent text-transparent'

                  const badgeLabel =
                    item.status === 'soon'
                      ? t('soon')
                      : item.status === 'beta'
                        ? t('betaBadge')
                        : isActive
                          ? t('active')
                          : activeSection === item.section
                            ? t('section')
                            : '.'

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onNavigate(item.id)
                        onClose()
                      }}
                      className={`tool-nav-item ${isActive ? 'tool-nav-item-active' : ''}`}
                    >
                      <span className="flex items-start gap-3 text-left">
                        <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${isActive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>
                          <ToolIcon toolId={item.id} className="h-4 w-4" />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold text-slate-900">{item.label}</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-500">{item.description}</span>
                        </span>
                      </span>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${badgeClass}`}>
                        {badgeLabel}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      <div className="border-t border-slate-100/80 bg-slate-50/70 px-6 py-5 text-sm text-slate-500">
        {t('sidebarFooter')}
      </div>
    </aside>
  )
}
