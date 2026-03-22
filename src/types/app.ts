export type AppSectionId = 'general' | 'video' | 'image'

export type AppToolId = 'home' | 'video-merge' | 'image-convert'

export interface SidebarItem {
  id: AppToolId
  label: string
  description: string
  section: AppSectionId
}
