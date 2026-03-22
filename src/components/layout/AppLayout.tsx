import type { ReactNode } from 'react'

import { Footer } from '../shared/Footer'
import { MobileToolNav } from './MobileToolNav'
import { Sidebar } from './Sidebar'
import type { AppSectionId, AppToolId, SidebarItem } from '../../types/app'

interface AppLayoutProps {
  children: ReactNode
  items: SidebarItem[]
  activeTool: AppToolId
  activeSection: AppSectionId
  onNavigate: (tool: AppToolId) => void
}

export function AppLayout({ children, items, activeTool, activeSection, onNavigate }: AppLayoutProps) {
  return (
    <div className="mx-auto min-h-screen w-full max-w-[1560px] overflow-x-hidden px-3 py-3 sm:px-5 sm:py-5 lg:px-8 lg:py-6">
      <div className="grid min-h-[calc(100vh-1.5rem)] gap-3 sm:gap-4 lg:grid-cols-[290px_minmax(0,1fr)] lg:gap-6">
        <Sidebar items={items} activeTool={activeTool} activeSection={activeSection} onNavigate={onNavigate} />

        <div className="flex min-w-0 overflow-x-hidden flex-col gap-3 sm:gap-4 lg:gap-6">
          <div className="relative z-40">
            <MobileToolNav items={items} activeTool={activeTool} onNavigate={onNavigate} />
          </div>
          <main className="flex min-w-0 overflow-x-hidden flex-1 flex-col gap-4 sm:gap-5 lg:gap-6">{children}</main>
          <Footer />
        </div>
      </div>
    </div>
  )
}
