import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

import { useLocale } from '../../i18n/LocaleProvider'
import { getCanonicalUrl, getOgImageUrl, getSeoContent, SEO_OG_IMAGE_ALT, SEO_SITE_NAME } from '../../lib/seo'
import { getToolFromPath } from '../../lib/routes'

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
  const location = useLocation()

  useEffect(() => {
    const activeTool = getToolFromPath(location.pathname)
    const { title, description, canonicalPath } = getSeoContent(locale, activeTool)
    const canonicalUrl = getCanonicalUrl(canonicalPath)
    const imageUrl = getOgImageUrl()

    document.title = title

    upsertMeta('meta[name="description"]', { name: 'description', content: description })
    upsertMeta('meta[name="robots"]', { name: 'robots', content: 'index, follow' })
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title })
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description })
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' })
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl })
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: SEO_SITE_NAME })
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: imageUrl })
    upsertMeta('meta[property="og:image:alt"]', { property: 'og:image:alt', content: SEO_OG_IMAGE_ALT })
    upsertMeta('meta[property="og:image:width"]', { property: 'og:image:width', content: '629' })
    upsertMeta('meta[property="og:image:height"]', { property: 'og:image:height', content: '552' })
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description })
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: imageUrl })
    upsertMeta('meta[name="twitter:image:alt"]', { name: 'twitter:image:alt', content: SEO_OG_IMAGE_ALT })
    upsertLink('link[rel="canonical"]', { rel: 'canonical', href: canonicalUrl })
  }, [locale, location.pathname])

  return null
}
