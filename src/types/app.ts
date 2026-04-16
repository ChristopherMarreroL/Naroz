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
  | 'video-speed'
  | 'image-convert'
  | 'image-remove-background'
  | 'image-crop'
  | 'image-transform'
  | 'document-merge-pdf'
  | 'document-delete-pages'
  | 'document-merge-docx'
  | 'document-msg-to-pdf'

export interface SidebarItem {
  id: AppToolId
  label: string
  description: string
  section: AppSectionId
  status?: ToolStatus
}
