import { Suspense, lazy, useEffect, useMemo, useState } from 'react'

import { AppLayout } from './components/layout/AppLayout'
import { SeoHead } from './components/shared/SeoHead'
import { HomeView } from './features/home/HomeView'
import { useLocale } from './i18n/LocaleProvider'
import type { AppSectionId, AppToolId, SidebarItem } from './types/app'

const VideoMergeView = lazy(() => import('./features/video/VideoMergeView').then((module) => ({ default: module.VideoMergeView })))
const VideoConvertView = lazy(() => import('./features/video/VideoConvertView').then((module) => ({ default: module.VideoConvertView })))
const AudioExtractView = lazy(() => import('./features/video/AudioExtractView').then((module) => ({ default: module.AudioExtractView })))
const VideoRemoveAudioView = lazy(() => import('./features/video/VideoRemoveAudioView').then((module) => ({ default: module.VideoRemoveAudioView })))
const VideoTrimView = lazy(() => import('./features/video/VideoTrimView').then((module) => ({ default: module.VideoTrimView })))
const VideoResizeView = lazy(() => import('./features/video/VideoResizeView').then((module) => ({ default: module.VideoResizeView })))
const ImageConvertView = lazy(() => import('./features/image/ImageConvertView').then((module) => ({ default: module.ImageConvertView })))
const ImageBackgroundRemoveView = lazy(() => import('./features/image/ImageBackgroundRemoveView').then((module) => ({ default: module.ImageBackgroundRemoveView })))
const ImageCropView = lazy(() => import('./features/image/ImageCropView').then((module) => ({ default: module.ImageCropView })))
const ImageTransformView = lazy(() => import('./features/image/ImageTransformView').then((module) => ({ default: module.ImageTransformView })))
const PdfMergeView = lazy(() => import('./features/document/PdfMergeView').then((module) => ({ default: module.PdfMergeView })))
const PdfDeletePagesView = lazy(() => import('./features/document/PdfDeletePagesView').then((module) => ({ default: module.PdfDeletePagesView })))
const DocxMergeView = lazy(() => import('./features/document/DocxMergeView').then((module) => ({ default: module.DocxMergeView })))

const ROUTABLE_TOOLS: AppToolId[] = [
  'home',
  'video-merge',
  'video-convert',
  'video-trim',
  'video-extract-audio',
  'video-remove-audio',
  'video-resize',
  'image-convert',
  'image-remove-background',
  'image-crop',
  'image-transform',
  'document-merge-pdf',
  'document-delete-pages',
  'document-merge-docx',
]

function getToolFromHash(): AppToolId {
  if (typeof window === 'undefined') {
    return 'home'
  }

  const hash = window.location.hash.replace(/^#/, '')
  return ROUTABLE_TOOLS.includes(hash as AppToolId) ? (hash as AppToolId) : 'home'
}

function ToolLoadingFallback() {
  const { t } = useLocale()
  return <div className="panel p-6 text-sm text-slate-500 sm:p-8">{t('loadingTool')}</div>
}

function getToolViewClassName(isActive: boolean) {
  return `${isActive ? 'flex' : 'hidden'} min-w-0 flex-col gap-6 sm:gap-8 lg:gap-10`
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
        id: 'video-remove-audio',
        label: t('removeAudio'),
        description: t('removeAudioDescShort'),
        section: 'video',
        status: 'stable',
      },
      {
        id: 'video-resize',
        label: t('resizeVideo'),
        description: t('resizeVideoDesc'),
        section: 'video',
        status: 'stable',
      },
      {
        id: 'image-convert',
        label: t('convertImage'),
        description: t('convertImagesDesc'),
        section: 'image',
        status: 'stable',
      },
      {
        id: 'image-crop',
        label: t('cropImage'),
        description: t('cropImageShortDesc'),
        section: 'image',
        status: 'stable',
      },
      {
        id: 'image-transform',
        label: t('transformImage'),
        description: t('transformImageShortDesc'),
        section: 'image',
        status: 'stable',
      },
      {
        id: 'image-remove-background',
        label: t('removeImageBackground'),
        description: t('removeImageBackgroundShortDesc'),
        section: 'image',
        status: 'beta',
      },
      {
        id: 'document-merge-pdf',
        label: t('mergePdf'),
        description: t('combinePdfDesc'),
        section: 'document',
        status: 'stable',
      },
      {
        id: 'document-delete-pages',
        label: t('deletePdfPages'),
        description: t('deletePdfPagesShortDesc'),
        section: 'document',
        status: 'beta',
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

  const initialTool = getToolFromHash()
  const [activeTool, setActiveTool] = useState<AppToolId>(initialTool)
  const [mountedTools, setMountedTools] = useState<AppToolId[]>([initialTool])

  useEffect(() => {
    const syncFromHash = () => {
      const nextTool = getToolFromHash()
      setMountedTools((current) => (current.includes(nextTool) ? current : [...current, nextTool]))
      setActiveTool(nextTool)
    }

    if (!window.location.hash) {
      window.history.replaceState(null, '', '#home')
    }

    window.addEventListener('hashchange', syncFromHash)
    syncFromHash()

    return () => {
      window.removeEventListener('hashchange', syncFromHash)
    }
  }, [])

  const handleNavigate = (tool: AppToolId) => {
    setMountedTools((current) => (current.includes(tool) ? current : [...current, tool]))
    setActiveTool(tool)
    if (window.location.hash.replace(/^#/, '') !== tool) {
      window.location.hash = tool
    }
  }

  const activeItem = sidebarItems.find((item) => item.id === activeTool) ?? sidebarItems[0]

  const activeSection: AppSectionId = activeItem.section

  return (
    <>
      <SeoHead />
      <AppLayout items={sidebarItems} activeTool={activeTool} activeSection={activeSection} onNavigate={handleNavigate} onGoHome={() => handleNavigate('home')}>
        {mountedTools.includes('home') ? <div className={getToolViewClassName(activeTool === 'home')}><HomeView onNavigate={handleNavigate} /></div> : null}
        {mountedTools.includes('video-merge') ? <div className={getToolViewClassName(activeTool === 'video-merge')}><Suspense fallback={<ToolLoadingFallback />}><VideoMergeView /></Suspense></div> : null}
        {mountedTools.includes('video-convert') ? <div className={getToolViewClassName(activeTool === 'video-convert')}><Suspense fallback={<ToolLoadingFallback />}><VideoConvertView /></Suspense></div> : null}
        {mountedTools.includes('video-trim') ? <div className={getToolViewClassName(activeTool === 'video-trim')}><Suspense fallback={<ToolLoadingFallback />}><VideoTrimView /></Suspense></div> : null}
        {mountedTools.includes('video-extract-audio') ? <div className={getToolViewClassName(activeTool === 'video-extract-audio')}><Suspense fallback={<ToolLoadingFallback />}><AudioExtractView /></Suspense></div> : null}
        {mountedTools.includes('video-remove-audio') ? <div className={getToolViewClassName(activeTool === 'video-remove-audio')}><Suspense fallback={<ToolLoadingFallback />}><VideoRemoveAudioView /></Suspense></div> : null}
        {mountedTools.includes('video-resize') ? <div className={getToolViewClassName(activeTool === 'video-resize')}><Suspense fallback={<ToolLoadingFallback />}><VideoResizeView /></Suspense></div> : null}
        {mountedTools.includes('image-convert') ? <div className={getToolViewClassName(activeTool === 'image-convert')}><Suspense fallback={<ToolLoadingFallback />}><ImageConvertView /></Suspense></div> : null}
        {mountedTools.includes('image-crop') ? <div className={getToolViewClassName(activeTool === 'image-crop')}><Suspense fallback={<ToolLoadingFallback />}><ImageCropView /></Suspense></div> : null}
        {mountedTools.includes('image-transform') ? <div className={getToolViewClassName(activeTool === 'image-transform')}><Suspense fallback={<ToolLoadingFallback />}><ImageTransformView /></Suspense></div> : null}
        {mountedTools.includes('image-remove-background') ? <div className={getToolViewClassName(activeTool === 'image-remove-background')}><Suspense fallback={<ToolLoadingFallback />}><ImageBackgroundRemoveView /></Suspense></div> : null}
        {mountedTools.includes('document-merge-pdf') ? <div className={getToolViewClassName(activeTool === 'document-merge-pdf')}><Suspense fallback={<ToolLoadingFallback />}><PdfMergeView /></Suspense></div> : null}
        {mountedTools.includes('document-delete-pages') ? <div className={getToolViewClassName(activeTool === 'document-delete-pages')}><Suspense fallback={<ToolLoadingFallback />}><PdfDeletePagesView /></Suspense></div> : null}
        {mountedTools.includes('document-merge-docx') ? <div className={getToolViewClassName(activeTool === 'document-merge-docx')}><Suspense fallback={<ToolLoadingFallback />}><DocxMergeView /></Suspense></div> : null}
      </AppLayout>
    </>
  )
}

export default App
