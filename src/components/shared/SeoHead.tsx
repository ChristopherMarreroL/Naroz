import { useEffect } from 'react'

import { useLocale } from '../../i18n/LocaleProvider'
import { getCanonicalUrl, getSeoContent, SEO_SITE_NAME } from '../../lib/seo'

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

function upsertLink(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector(selector) as HTMLLinkElement | null

  if (!element) {
    element = document.createElement('link')
    document.head.appendChild(element)
  }

  Object.entries(attributes).forEach(([key, value]) => {
    element?.setAttribute(key, value)
  })
}

export function SeoHead() {
  const { locale } = useLocale()

  useEffect(() => {
    const { title, description } = getSeoContent(locale)
    const canonicalUrl = getCanonicalUrl()

    document.title = title

    upsertMeta('meta[name="description"]', { name: 'description', content: description })
    upsertMeta('meta[name="robots"]', { name: 'robots', content: 'index, follow' })
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title })
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description })
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' })
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl })
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: SEO_SITE_NAME })
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary' })
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description })
    upsertLink('link[rel="canonical"]', { rel: 'canonical', href: canonicalUrl })
  }, [locale])

  return null
}
