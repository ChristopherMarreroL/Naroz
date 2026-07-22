import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { AppLayout } from './components/layout/AppLayout'
import { SeoHead } from './components/shared/SeoHead'
import { HomeView } from './features/home/HomeView'
import { useLocale } from './i18n/LocaleProvider'
import { notify } from './lib/notifications'
import { getToolFromPath, getToolPath } from './lib/routes'
import type { AppSectionId, AppToolId, SidebarItem } from './types/app'

const VideoMergeView = lazy(() => import('./features/video/VideoMergeView').then((module) => ({ default: module.VideoMergeView })))
const VideoConvertView = lazy(() => import('./features/video/VideoConvertView').then((module) => ({ default: module.VideoConvertView })))
const AudioExtractView = lazy(() => import('./features/video/AudioExtractView').then((module) => ({ default: module.AudioExtractView })))
const VideoRemoveAudioView = lazy(() => import('./features/video/VideoRemoveAudioView').then((module) => ({ default: module.VideoRemoveAudioView })))
const VideoTrimView = lazy(() => import('./features/video/VideoTrimView').then((module) => ({ default: module.VideoTrimView })))
const VideoResizeView = lazy(() => import('./features/video/VideoResizeView').then((module) => ({ default: module.VideoResizeView })))
const VideoSpeedView = lazy(() => import('./features/video/VideoSpeedView').then((module) => ({ default: module.VideoSpeedView })))
const ImageConvertView = lazy(() => import('./features/image/ImageConvertView').then((module) => ({ default: module.ImageConvertView })))
const ImageBackgroundRemoveView = lazy(() => import('./features/image/ImageBackgroundRemoveView').then((module) => ({ default: module.ImageBackgroundRemoveView })))
const ImageCropView = lazy(() => import('./features/image/ImageCropView').then((module) => ({ default: module.ImageCropView })))
const ImageTransformView = lazy(() => import('./features/image/ImageTransformView').then((module) => ({ default: module.ImageTransformView })))
const PdfMergeView = lazy(() => import('./features/document/PdfMergeView').then((module) => ({ default: module.PdfMergeView })))
const PdfDeletePagesView = lazy(() => import('./features/document/PdfDeletePagesView').then((module) => ({ default: module.PdfDeletePagesView })))
const DocxMergeView = lazy(() => import('./features/document/DocxMergeView').then((module) => ({ default: module.DocxMergeView })))
const MsgToPdfView = lazy(() => import('./features/document/MsgToPdfView').then((module) => ({ default: module.MsgToPdfView })))
const MarkdownConverterView = lazy(() => import('./features/document/MarkdownConverterView').then((module) => ({ default: module.MarkdownConverterView })))
const PdfToOfficeView = lazy(() => import('./features/document/PdfToOfficeView').then((module) => ({ default: module.PdfToOfficeView })))
const OfficeToPdfView = lazy(() => import('./features/document/OfficeToPdfView').then((module) => ({ default: module.OfficeToPdfView })))
const ExcelColumnBuilderView = lazy(() => import('./features/excel/ExcelColumnBuilderView').then((module) => ({ default: module.ExcelColumnBuilderView })))
const ExcelJoinView = lazy(() => import('./features/excel-join/ExcelJoinView').then((module) => ({ default: module.ExcelJoinView })))
const QrGeneratorView = lazy(() => import('./features/qr/QrGeneratorView').then((module) => ({ default: module.QrGeneratorView })))

function ToolLoadingFallback() {
  const { t } = useLocale()
  return <div className="panel p-6 text-sm text-slate-500 sm:p-8">{t('loadingTool')}</div>
}

function getToolViewClassName(isActive: boolean) {
  return `${isActive ? 'flex' : 'hidden'} min-w-0 flex-col gap-6 sm:gap-8 lg:gap-10`
}

function App() {
  const { locale, t } = useLocale()
  const location = useLocation()
  const navigate = useNavigate()
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
        id: 'video-speed',
        label: t('changeSpeed'),
        description: t('changeSpeedDesc'),
        section: 'video',
        status: 'beta',
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
      {
        id: 'document-msg-to-pdf',
        label: t('mailToPdf'),
        description: t('mailToPdfShortDesc'),
        section: 'document',
        status: 'beta',
      },
      {
        id: 'document-markdown-converter',
        label: t('markdownNavTitle'),
        description: t('markdownShortDescription'),
        section: 'document',
        status: 'beta',
      },
      {
        id: 'document-pdf-to-office',
        label: t('pdfOfficeNavTitle'),
        description: t('pdfOfficeShortDescription'),
        section: 'document',
        status: 'beta',
      },
      {
        id: 'document-office-to-pdf',
        label: t('officePdfNavTitle'),
        description: t('officePdfShortDescription'),
        section: 'document',
        status: 'beta',
      },
      {
        id: 'document-excel-column-builder',
        label: t('excelColumnBuilderNavTitle'),
        description: t('excelColumnBuilderShortDesc'),
        section: 'document',
        status: 'stable',
      },
      {
        id: 'document-excel-join',
        label: t('excelJoinNavTitle'),
        description: t('excelJoinShortDesc'),
        section: 'document',
        status: 'stable',
      },
      {
        id: 'utility-qr-generator',
        label: t('qrGeneratorNavTitle'),
        description: t('qrGeneratorShortDesc'),
        section: 'utility',
        status: 'stable',
      },
    ],
    [t],
  )

  const activeTool = useMemo(() => getToolFromPath(location.pathname), [location.pathname])

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.pathname])

  useEffect(() => {
    if (activeTool === 'home' && location.pathname !== '/') {
      navigate('/', { replace: true })
    }
  }, [activeTool, location.pathname, navigate])

  const handleNavigate = (tool: AppToolId) => {
    const nextPath = getToolPath(tool)
    if (location.pathname !== nextPath) {
      navigate(nextPath)
    }
  }

  const handleGoHome = () => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: location.pathname === '/' ? 'smooth' : 'auto',
    })

    if (location.pathname !== '/') {
      navigate('/')
    }
  }

  const activeItem = sidebarItems.find((item) => item.id === activeTool) ?? sidebarItems[0]

  const lastBetaNoticeRef = useRef<string | null>(null)

  useEffect(() => {
    if (activeItem.status !== 'beta') {
      lastBetaNoticeRef.current = null
      return
    }

    const noticeKey = activeTool + ':' + locale
    if (lastBetaNoticeRef.current === noticeKey) return

    const message = (() => {
      if (activeTool === 'video-trim') return t('betaTrimMessage')
      if (activeTool === 'image-remove-background') return t('removeBackgroundBetaMessage')
      if (activeTool === 'document-merge-docx') return t('betaWordMessage')
      if (activeTool === 'document-msg-to-pdf') return t('mailToPdfBetaMessage')
      if (activeTool === 'document-pdf-to-office') return t('pdfOfficeBetaMessage')
      if (activeTool === 'document-office-to-pdf') return t('officePdfBetaMessage')
      return t('betaDefaultMessage')
    })()

    lastBetaNoticeRef.current = noticeKey
    notify('warning', t('pdfOfficeBetaTitle'), message)
  }, [activeItem.status, activeTool, locale, t])
  const activeSection: AppSectionId = activeItem.section

  return (
    <>
      <SeoHead />
      <AppLayout items={sidebarItems} activeTool={activeTool} activeSection={activeSection} onNavigate={handleNavigate} onGoHome={handleGoHome}>
        {activeTool === 'home' ? <div className={getToolViewClassName(true)}><HomeView onNavigate={handleNavigate} /></div> : null}
        {activeTool === 'video-merge' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><VideoMergeView /></Suspense></div> : null}
        {activeTool === 'video-convert' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><VideoConvertView /></Suspense></div> : null}
        {activeTool === 'video-trim' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><VideoTrimView /></Suspense></div> : null}
        {activeTool === 'video-extract-audio' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><AudioExtractView /></Suspense></div> : null}
        {activeTool === 'video-remove-audio' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><VideoRemoveAudioView /></Suspense></div> : null}
        {activeTool === 'video-resize' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><VideoResizeView /></Suspense></div> : null}
        {activeTool === 'video-speed' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><VideoSpeedView /></Suspense></div> : null}
        {activeTool === 'image-convert' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><ImageConvertView /></Suspense></div> : null}
        {activeTool === 'image-crop' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><ImageCropView /></Suspense></div> : null}
        {activeTool === 'image-transform' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><ImageTransformView /></Suspense></div> : null}
        {activeTool === 'image-remove-background' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><ImageBackgroundRemoveView /></Suspense></div> : null}
        {activeTool === 'document-merge-pdf' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><PdfMergeView /></Suspense></div> : null}
        {activeTool === 'document-delete-pages' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><PdfDeletePagesView /></Suspense></div> : null}
        {activeTool === 'document-merge-docx' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><DocxMergeView /></Suspense></div> : null}
        {activeTool === 'document-msg-to-pdf' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><MsgToPdfView /></Suspense></div> : null}
        {activeTool === 'document-markdown-converter' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><MarkdownConverterView /></Suspense></div> : null}
        {activeTool === 'document-pdf-to-office' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><PdfToOfficeView /></Suspense></div> : null}
        {activeTool === 'document-office-to-pdf' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><OfficeToPdfView /></Suspense></div> : null}
        {activeTool === 'document-excel-column-builder' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><ExcelColumnBuilderView /></Suspense></div> : null}
        {activeTool === 'document-excel-join' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><ExcelJoinView /></Suspense></div> : null}
        {activeTool === 'utility-qr-generator' ? <div className={getToolViewClassName(true)}><Suspense fallback={<ToolLoadingFallback />}><QrGeneratorView /></Suspense></div> : null}
      </AppLayout>
    </>
  )
}

export default App
