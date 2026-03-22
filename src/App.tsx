import { useMemo, useState } from 'react'

import { AppLayout } from './components/layout/AppLayout'
import { HomeView } from './features/home/HomeView'
import { ImageConvertView } from './features/image/ImageConvertView'
import { VideoMergeView } from './features/video/VideoMergeView'
import type { AppSectionId, AppToolId, SidebarItem } from './types/app'

const sidebarItems: SidebarItem[] = [
  {
    id: 'home',
    label: 'Inicio',
    description: 'Resumen de herramientas',
    section: 'general',
  },
  {
    id: 'video-merge',
    label: 'Unir videos',
    description: 'Combina varios videos',
    section: 'video',
  },
  {
    id: 'image-convert',
    label: 'Convertir formato',
    description: 'Convierte JPG, PNG y WebP',
    section: 'image',
  },
]

function App() {
  const [activeTool, setActiveTool] = useState<AppToolId>('home')

  const activeItem = useMemo(
    () => sidebarItems.find((item) => item.id === activeTool) ?? sidebarItems[0],
    [activeTool],
  )

  const activeSection: AppSectionId = activeItem.section

  return (
    <AppLayout
      items={sidebarItems}
      activeTool={activeTool}
      activeSection={activeSection}
      onNavigate={setActiveTool}
    >
      {activeTool === 'home' ? <HomeView onNavigate={setActiveTool} /> : null}
      {activeTool === 'video-merge' ? <VideoMergeView /> : null}
      {activeTool === 'image-convert' ? <ImageConvertView /> : null}
    </AppLayout>
  )
}

export default App
