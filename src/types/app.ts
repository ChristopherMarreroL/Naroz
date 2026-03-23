export type AppSectionId = 'general' | 'video' | 'image' | 'document'

export type AppToolId =
  | 'home'
  | 'video-merge'
  | 'video-convert'
  | 'video-trim'
  | 'video-extract-audio'
  | 'video-resize'
  | 'image-convert'
  | 'document-merge-pdf'
  | 'document-merge-docx'

export interface SidebarItem {
  id: AppToolId
  label: string
  description: string
  section: AppSectionId
  available?: boolean
}
