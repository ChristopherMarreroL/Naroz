import type { AppToolId } from '../types/app'

export const TOOL_PATHS: Record<AppToolId, string> = {
  home: '/',
  'video-merge': '/video-merge',
  'video-convert': '/video-convert',
  'video-trim': '/video-trim',
  'video-extract-audio': '/video-extract-audio',
  'video-remove-audio': '/video-remove-audio',
  'video-resize': '/video-resize',
  'video-speed': '/video-speed',
  'image-convert': '/image-convert',
  'image-remove-background': '/image-remove-background',
  'image-crop': '/image-crop',
  'image-transform': '/image-transform',
  'document-merge-pdf': '/document-merge-pdf',
  'document-delete-pages': '/document-delete-pages',
  'document-merge-docx': '/document-merge-docx',
}

export const ROUTABLE_TOOLS = Object.keys(TOOL_PATHS) as AppToolId[]

export function getToolPath(tool: AppToolId) {
  return TOOL_PATHS[tool]
}

export function getToolFromPath(pathname: string): AppToolId {
  const normalizedPath = pathname === '/' ? '/' : pathname.replace(/\/+$/, '')
  const match = ROUTABLE_TOOLS.find((tool) => TOOL_PATHS[tool] === normalizedPath)
  return match ?? 'home'
}
