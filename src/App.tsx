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
const VideoTrimView = lazy(() => import('./features/video/VideoTrimView').then((module) => ({ default: module.VideoTrimView })))
const ImageConvertView = lazy(() => import('./features/image/ImageConvertView').then((module) => ({ default: module.ImageConvertView })))
const PdfMergeView = lazy(() => import('./features/document/PdfMergeView').then((module) => ({ default: module.PdfMergeView })))
const DocxMergeView = lazy(() => import('./features/document/DocxMergeView').then((module) => ({ default: module.DocxMergeView })))

function ToolLoadingFallback() {
  const { t } = useLocale()
  return <div className="panel p-6 text-sm text-slate-500 sm:p-8">{t('loadingTool')}</div>
}

function getToolViewClassName(isActive: boolean) {
  return `${isActive ? 'flex' : 'hidden'} min-w-0 flex-col gap-5 sm:gap-6 lg:gap-8`
}

function App() {
  const { t } = useLocale()
  const sidebarItems: SidebarItem[] = useMemo(
    () => [
      {
        id: 'home',
        label: t('home'),
        description: t('homeOverview'),
        section: 'general',
        status: 'stable',
      },
      {
        id: 'video-merge',
        label: t('mergeVideos'),
        description: t('combineVideosDesc'),
        section: 'video',
        status: 'stable',
      },
      {
        id: 'video-convert',
        label: t('convertVideo'),
        description: t('changeVideoContainerDesc'),
        section: 'video',
        status: 'stable',
      },
      {
        id: 'video-trim',
        label: t('trimVideo'),
        description: t('keepOneSegmentDesc'),
        section: 'video',
        status: 'beta',
      },
      {
        id: 'video-extract-audio',
        label: t('extractAudio'),
        description: t('turnVideoIntoAudioDesc'),
        section: 'video',
        status: 'stable',
      },
      {
        id: 'video-resize',
        label: t('resizeVideo'),
        description: t('resizeVideoDesc'),
        section: 'video',
        status: 'soon',
      },
      {
        id: 'image-convert',
        label: t('convertImage'),
        description: t('convertImagesDesc'),
        section: 'image',
        status: 'stable',
      },
      {
        id: 'document-merge-pdf',
        label: t('mergePdf'),
        description: t('combinePdfDesc'),
        section: 'document',
        status: 'stable',
      },
      {
        id: 'document-merge-docx',
        label: t('mergeWord'),
        description: t('combineDocxDesc'),
        section: 'document',
        status: 'beta',
      },
    ],
    [t],
  )

  const [activeTool, setActiveTool] = useState<AppToolId>('home')
  const [mountedTools, setMountedTools] = useState<AppToolId[]>(['home'])

  const handleNavigate = (tool: AppToolId) => {
    setMountedTools((current) => (current.includes(tool) ? current : [...current, tool]))
    setActiveTool(tool)
  }

  const activeItem = sidebarItems.find((item) => item.id === activeTool) ?? sidebarItems[0]

  const activeSection: AppSectionId = activeItem.section

  return (
    <>
      <SeoHead />
      <AppLayout items={sidebarItems} activeTool={activeTool} activeSection={activeSection} onNavigate={handleNavigate}>
        {mountedTools.includes('home') ? <div className={getToolViewClassName(activeTool === 'home')}><HomeView onNavigate={handleNavigate} /></div> : null}
        {mountedTools.includes('video-merge') ? <div className={getToolViewClassName(activeTool === 'video-merge')}><Suspense fallback={<ToolLoadingFallback />}><VideoMergeView /></Suspense></div> : null}
        {mountedTools.includes('video-convert') ? <div className={getToolViewClassName(activeTool === 'video-convert')}><Suspense fallback={<ToolLoadingFallback />}><VideoConvertView /></Suspense></div> : null}
        {mountedTools.includes('video-trim') ? <div className={getToolViewClassName(activeTool === 'video-trim')}><Suspense fallback={<ToolLoadingFallback />}><VideoTrimView /></Suspense></div> : null}
        {mountedTools.includes('video-extract-audio') ? <div className={getToolViewClassName(activeTool === 'video-extract-audio')}><Suspense fallback={<ToolLoadingFallback />}><AudioExtractView /></Suspense></div> : null}
        {mountedTools.includes('video-resize') ? <div className={getToolViewClassName(activeTool === 'video-resize')}><ToolPlaceholderView badge={t('resizeVideo')} title={t('resizeVideo')} description={t('resizeVideoDesc')} /></div> : null}
        {mountedTools.includes('image-convert') ? <div className={getToolViewClassName(activeTool === 'image-convert')}><Suspense fallback={<ToolLoadingFallback />}><ImageConvertView /></Suspense></div> : null}
        {mountedTools.includes('document-merge-pdf') ? <div className={getToolViewClassName(activeTool === 'document-merge-pdf')}><Suspense fallback={<ToolLoadingFallback />}><PdfMergeView /></Suspense></div> : null}
        {mountedTools.includes('document-merge-docx') ? <div className={getToolViewClassName(activeTool === 'document-merge-docx')}><Suspense fallback={<ToolLoadingFallback />}><DocxMergeView /></Suspense></div> : null}
      </AppLayout>
    </>
  )
}

export default App
