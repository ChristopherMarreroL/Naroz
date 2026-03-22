import { useMemo, useState } from 'react'

import { AppLayout } from './components/layout/AppLayout'
import { HomeView } from './features/home/HomeView'
import { ImageConvertView } from './features/image/ImageConvertView'
import { ToolPlaceholderView } from './features/shared/ToolPlaceholderView'
import { VideoConvertView } from './features/video/VideoConvertView'
import { VideoMergeView } from './features/video/VideoMergeView'
import { useLocale } from './i18n/LocaleProvider'
import type { AppSectionId, AppToolId, SidebarItem } from './types/app'

function App() {
  const { locale } = useLocale()
  const sidebarItems: SidebarItem[] = useMemo(
    () => [
      {
        id: 'home',
        label: locale === 'es' ? 'Inicio' : 'Home',
        description: locale === 'es' ? 'Resumen de herramientas' : 'Tools overview',
        section: 'general',
      },
      {
        id: 'video-merge',
        label: locale === 'es' ? 'Unir videos' : 'Merge videos',
        description: locale === 'es' ? 'Combina varios videos' : 'Combine multiple videos',
        section: 'video',
        available: true,
      },
      {
        id: 'video-convert',
        label: locale === 'es' ? 'Convertir formato' : 'Convert format',
        description: locale === 'es' ? 'Cambia el formato del video' : 'Change the video container',
        section: 'video',
        available: true,
      },
      {
        id: 'video-trim',
        label: locale === 'es' ? 'Recortar video' : 'Trim video',
        description: locale === 'es' ? 'Selecciona solo un fragmento' : 'Keep only one segment',
        section: 'video',
        available: false,
      },
      {
        id: 'video-extract-audio',
        label: locale === 'es' ? 'Extraer audio' : 'Extract audio',
        description: locale === 'es' ? 'Convierte video a audio' : 'Turn video into audio',
        section: 'video',
        available: false,
      },
      {
        id: 'video-resize',
        label: locale === 'es' ? 'Cambiar resolucion' : 'Resize video',
        description: locale === 'es' ? 'Ajusta el tamano del video' : 'Adjust video dimensions',
        section: 'video',
        available: false,
      },
      {
        id: 'image-convert',
        label: locale === 'es' ? 'Convertir formato' : 'Convert image',
        description: locale === 'es' ? 'Convierte imagenes' : 'Convert images',
        section: 'image',
        available: true,
      },
    ],
    [locale],
  )

  const [activeTool, setActiveTool] = useState<AppToolId>('home')

  const activeItem = sidebarItems.find((item) => item.id === activeTool) ?? sidebarItems[0]

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
      {activeTool === 'video-convert' ? <VideoConvertView /> : null}
      {activeTool === 'video-trim' ? (
        <ToolPlaceholderView
          badge={locale === 'es' ? 'Video / Recortar' : 'Video / Trim'}
          title={locale === 'es' ? 'Recorta tus videos por tiempo' : 'Trim your videos by time'}
          description={locale === 'es' ? 'La base ya esta preparada para agregar seleccion de inicio y fin, con vista previa y exportacion final.' : 'The suite is already prepared for start/end selection, preview, and final export.'}
        />
      ) : null}
      {activeTool === 'video-extract-audio' ? (
        <ToolPlaceholderView
          badge={locale === 'es' ? 'Video / Extraer audio' : 'Video / Extract audio'}
          title={locale === 'es' ? 'Extrae audio directamente desde un video' : 'Extract audio directly from a video'}
          description={locale === 'es' ? 'Muy pronto podras separar el audio y exportarlo a formatos pensados para voz, musica o podcasts.' : 'Soon you will be able to separate audio and export it to formats for voice, music, or podcasts.'}
        />
      ) : null}
      {activeTool === 'video-resize' ? (
        <ToolPlaceholderView
          badge={locale === 'es' ? 'Video / Cambiar resolucion' : 'Video / Resize'}
          title={locale === 'es' ? 'Ajusta el tamano y la resolucion de tus videos' : 'Resize and adapt your videos'}
          description={locale === 'es' ? 'Naroz tambien quedara preparado para crear versiones ligeras, verticales o adaptadas a redes sociales.' : 'Naroz will also support lighter, vertical, or social-media-ready versions.'}
        />
      ) : null}
      {activeTool === 'image-convert' ? <ImageConvertView /> : null}
    </AppLayout>
  )
}

export default App
