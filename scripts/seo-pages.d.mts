export interface SeoPage {
  id: string
  path: string
  title: string
  description: string
}

export const SEO_SITE_URL: string
export const seoPages: SeoPage[]
export function createStructuredData(page: SeoPage, siteUrl?: string): object
export function renderSeoPageHtml(sourceHtml: string, page: SeoPage, siteUrl?: string): string
export function renderNotFoundHtml(sourceHtml: string): string
