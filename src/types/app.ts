export type AppSectionId = 'general' | 'video' | 'image' | 'document'
export type ToolStatus = 'stable' | 'beta' | 'soon'

export type AppToolId =
  | 'home'
  | 'video-merge'
  | 'video-convert'
  | 'video-trim'
  | 'video-extract-audio'
  | 'video-remove-audio'
  | 'video-resize'
  | 'image-convert'
  | 'image-remove-background'
  | 'document-merge-pdf'
  | 'document-merge-docx'

export interface SidebarItem {
  id: AppToolId
  label: string
  description: string
  section: AppSectionId
  status?: ToolStatus
}
