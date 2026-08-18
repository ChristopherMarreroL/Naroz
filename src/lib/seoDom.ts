import type { Locale } from '../i18n/LocaleProvider'

import { getNotFoundSeoContent, SEO_SITE_NAME } from './seo'

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector(selector) as HTMLMetaElement | null

  if (!element) {
    element = document.createElement('meta')
    document.head.appendChild(element)
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element?.setAttribute(key, value)
  })
}

export function applyNotFoundSeo(locale: Locale) {
  const { title, description } = getNotFoundSeoContent(locale)

  document.title = title
  upsertMeta('meta[name="description"]', { name: 'description', content: description })
  upsertMeta('meta[name="robots"]', { name: 'robots', content: 'noindex, nofollow' })
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title })
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description })
  upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' })
  upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: SEO_SITE_NAME })
  upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
  upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description })
  document.head.querySelector('meta[property="og:url"]')?.remove()
  document.head.querySelector('meta[name="twitter:url"]')?.remove()
  document.head.querySelector('link[rel="canonical"]')?.remove()
  document.head.querySelector('#naroz-structured-data')?.remove()
}
