import type { Locale } from '../i18n/LocaleProvider'

export const SEO_SITE_NAME = 'Naroz'
export const SEO_DEFAULT_SITE_URL = 'https://naroz.netlify.app'
export const SEO_OG_IMAGE_NOTE = 'Add a future social share image at public/og-image.jpg and wire it in when available.'

function normalizeSiteUrl(value: string) {
  return value.replace(/\/$/, '')
}

export function getSiteUrl() {
  const envUrl = import.meta.env.VITE_SITE_URL?.trim()

  if (envUrl) {
    return normalizeSiteUrl(envUrl)
  }

  if (typeof window !== 'undefined' && window.location.origin) {
    return normalizeSiteUrl(window.location.origin)
  }

  return SEO_DEFAULT_SITE_URL
}

export function getCanonicalUrl() {
  return `${getSiteUrl()}/`
}

export function getSeoContent(locale: Locale) {
  if (locale === 'en') {
    return {
      title: 'Naroz - Convert and transform files easily',
      description: 'Naroz is a web tool to convert, merge, and transform video and image files easily right in the browser.',
    }
  }

  return {
    title: 'Naroz - Convierte y transforma archivos facilmente',
    description: 'Naroz es una herramienta web para convertir, unir y transformar archivos de video e imagen facilmente desde el navegador.',
  }
}
