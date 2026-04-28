import { useState, type ReactNode } from 'react'

import { Footer } from '../shared/Footer'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useLocale } from '../../i18n/LocaleProvider'
import type { AppSectionId, AppToolId, SidebarItem } from '../../types/app'

interface AppLayoutProps {
  children: ReactNode
  items: SidebarItem[]
  activeTool: AppToolId
  activeSection: AppSectionId
  onNavigate: (tool: AppToolId) => void
  onGoHome: () => void
}

export function AppLayout({ children, items, activeTool, activeSection, onNavigate, onGoHome }: AppLayoutProps) {
  const { locale, setLocale, t } = useLocale()
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  return (
    <div className="mx-auto min-h-screen w-full max-w-[1560px] overflow-x-hidden px-3 py-3 sm:px-5 sm:py-5 lg:px-8 lg:py-6">
      <div className="flex min-h-[calc(100vh-1.5rem)] min-w-0 flex-col gap-3 sm:gap-4 lg:gap-6">
        <TopBar locale={locale} setLocale={setLocale} onOpenSidebar={() => setIsSidebarOpen(true)} onGoHome={onGoHome} />
        <div className="h-[88px] shrink-0 sm:h-[96px] lg:h-[104px]" />

        {isSidebarOpen ? (
          <>
            <button
              type="button"
              aria-label={t('closeNavigation')}
              className="backdrop-enter fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-[2px]"
              onClick={() => setIsSidebarOpen(false)}
            />
            <div className="drawer-enter fixed inset-y-0 left-0 z-50 w-[min(24rem,92vw)] overflow-hidden border-r border-slate-200 bg-white shadow-[20px_0_60px_-35px_rgba(15,23,42,0.45)]">
              <Sidebar
                items={items}
                activeTool={activeTool}
                activeSection={activeSection}
                onNavigate={onNavigate}
                onClose={() => setIsSidebarOpen(false)}
              />
            </div>
          </>
        ) : null}

        <main className="flex min-w-0 overflow-x-hidden flex-1 flex-col gap-5 sm:gap-6 lg:gap-8">{children}</main>
        <Footer />
      </div>
    </div>
  )
}
