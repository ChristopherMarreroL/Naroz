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
    <div className="mx-auto min-h-screen w-full max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <div className="grid min-h-[calc(100vh-2rem)] gap-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-6">
        <Sidebar items={items} activeTool={activeTool} activeSection={activeSection} onNavigate={onNavigate} />

        <div className="flex min-w-0 flex-col gap-4 lg:gap-6">
          <MobileToolNav items={items} activeTool={activeTool} onNavigate={onNavigate} />
          <main className="flex min-w-0 flex-1 flex-col gap-6">{children}</main>
          <Footer />
        </div>
      </div>
    </div>
  )
}
