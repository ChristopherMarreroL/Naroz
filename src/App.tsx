import { Suspense, lazy, useMemo, useState } from 'react'

import { AppLayout } from './components/layout/AppLayout'
import { SeoHead } from './components/shared/SeoHead'
import { HomeView } from './features/home/HomeView'
import { ToolPlaceholderView } from './features/shared/ToolPlaceholderView'
import { useLocale } from './i18n/LocaleProvider'
import type { AppSectionId, AppToolId, SidebarItem } from './types/app'

const VideoMergeView = lazy(() => import('./features/video/VideoMergeView').then((module) => ({ default: module.VideoMergeView })))
const VideoConvertView = lazy(() => import('./features/video/VideoConvertView').then((module) => ({ default: module.VideoConvertView })))
const AudioExtractView = lazy(() => import('./features/video/AudioExtractView').then((module) => ({ default: module.AudioExtractView })))
const ImageConvertView = lazy(() => import('./features/image/ImageConvertView').then((module) => ({ default: module.ImageConvertView })))
const PdfMergeView = lazy(() => import('./features/document/PdfMergeView').then((module) => ({ default: module.PdfMergeView })))
const DocxMergeView = lazy(() => import('./features/document/DocxMergeView').then((module) => ({ default: module.DocxMergeView })))

function ToolLoadingFallback() {
  return <div className="panel p-6 text-sm text-slate-500 sm:p-8">Cargando herramienta...</div>
}

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
        available: true,
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
      {
        id: 'document-merge-pdf',
        label: locale === 'es' ? 'Unir PDF' : 'Merge PDF',
        description: locale === 'es' ? 'Combina varios PDF' : 'Combine multiple PDFs',
        section: 'document',
        available: true,
      },
      {
        id: 'document-merge-docx',
        label: locale === 'es' ? 'Unir Word' : 'Merge Word',
        description: locale === 'es' ? 'Combina varios DOCX' : 'Combine multiple DOCX files',
        section: 'document',
        available: true,
      },
    ],
    [locale],
  )

  const [activeTool, setActiveTool] = useState<AppToolId>('home')

  const activeItem = sidebarItems.find((item) => item.id === activeTool) ?? sidebarItems[0]

  const activeSection: AppSectionId = activeItem.section

  return (
    <>
      <SeoHead />
      <AppLayout
        items={sidebarItems}
        activeTool={activeTool}
        activeSection={activeSection}
        onNavigate={setActiveTool}
      >
        {activeTool === 'home' ? <HomeView onNavigate={setActiveTool} /> : null}
        {activeTool === 'video-merge' ? <Suspense fallback={<ToolLoadingFallback />}><VideoMergeView /></Suspense> : null}
        {activeTool === 'video-convert' ? <Suspense fallback={<ToolLoadingFallback />}><VideoConvertView /></Suspense> : null}
        {activeTool === 'video-trim' ? (
          <ToolPlaceholderView
            badge={locale === 'es' ? 'Video / Recortar' : 'Video / Trim'}
            title={locale === 'es' ? 'Recorta tus videos por tiempo' : 'Trim your videos by time'}
            description={locale === 'es' ? 'La base ya esta preparada para agregar seleccion de inicio y fin, con vista previa y exportacion final.' : 'The suite is already prepared for start/end selection, preview, and final export.'}
          />
        ) : null}
        {activeTool === 'video-extract-audio' ? <Suspense fallback={<ToolLoadingFallback />}><AudioExtractView /></Suspense> : null}
        {activeTool === 'video-resize' ? (
          <ToolPlaceholderView
            badge={locale === 'es' ? 'Video / Cambiar resolucion' : 'Video / Resize'}
            title={locale === 'es' ? 'Ajusta el tamano y la resolucion de tus videos' : 'Resize and adapt your videos'}
            description={locale === 'es' ? 'Naroz tambien quedara preparado para crear versiones ligeras, verticales o adaptadas a redes sociales.' : 'Naroz will also support lighter, vertical, or social-media-ready versions.'}
          />
        ) : null}
        {activeTool === 'image-convert' ? <Suspense fallback={<ToolLoadingFallback />}><ImageConvertView /></Suspense> : null}
        {activeTool === 'document-merge-pdf' ? <Suspense fallback={<ToolLoadingFallback />}><PdfMergeView /></Suspense> : null}
        {activeTool === 'document-merge-docx' ? <Suspense fallback={<ToolLoadingFallback />}><DocxMergeView /></Suspense> : null}
      </AppLayout>
    </>
  )
}

export default App
