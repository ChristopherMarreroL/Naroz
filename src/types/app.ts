export type AppSectionId = 'general' | 'video' | 'image'

export type AppToolId =
  | 'home'
  | 'video-merge'
  | 'video-convert'
  | 'video-trim'
  | 'video-extract-audio'
  | 'video-resize'
  | 'image-convert'

export interface SidebarItem {
  id: AppToolId
  label: string
  description: string
  section: AppSectionId
  available?: boolean
}
