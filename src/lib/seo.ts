import type { Locale } from '../i18n/LocaleProvider'
import type { AppToolId } from '../types/app'
import { seoPages as staticSeoPages } from '../../scripts/seo-pages.mjs'
import { TOOL_PATHS, getToolPath } from './routes'

export const SEO_SITE_NAME = 'Naroz'
export const SEO_DEFAULT_SITE_URL = 'https://www.naroz.app'
export const SEO_OG_IMAGE_PATH = '/og-image.png'
export const SEO_OG_IMAGE_ALT = 'Naroz logo'

function normalizeSiteUrl(value: string) {
  return value.replace(/\/$/, '')
}

export function getSiteUrl() {
  const envUrl = import.meta.env.VITE_SITE_URL?.trim()

  if (envUrl) {
    return normalizeSiteUrl(envUrl)
  }

  return SEO_DEFAULT_SITE_URL
}

export function getCanonicalUrl(pathname = '/') {
  const normalizedPath = pathname === '/' ? '/' : `${pathname.replace(/\/$/, '')}/`
  return `${getSiteUrl()}${normalizedPath}`
}

export function getOgImageUrl() {
  return `${getSiteUrl()}${SEO_OG_IMAGE_PATH}`
}

export function getNotFoundSeoContent(locale: Locale) {
  return locale === 'es'
    ? {
        title: 'Pagina no encontrada - Naroz',
        description: 'La direccion solicitada no existe o fue movida.',
      }
    : {
        title: 'Page not found - Naroz',
        description: 'The requested address does not exist or has been moved.',
      }
}

const englishSeoByTool: Record<AppToolId, { title: string; description: string }> = {
  home: { title: 'Naroz: online tools for PDF, video, and images', description: 'Convert, merge, and transform PDF, Word, Excel, videos, and images for free and privately, directly in your browser with Naroz.' },
  'video-merge': { title: 'Merge videos - Naroz', description: 'Merge multiple MP4, MKV, or MOV videos into one export directly in the browser.' },
  'video-convert': { title: 'Convert video - Naroz', description: 'Convert videos between MP4, MKV, and MOV from a single web tool.' },
  'video-trim': { title: 'Trim video - Naroz', description: 'Trim a video segment with preview and local export.' },
  'video-extract-audio': { title: 'Extract audio - Naroz', description: 'Extract audio from an MP4, MKV, or MOV video and download it as MP3 or WAV.' },
  'video-remove-audio': { title: 'Remove audio - Naroz', description: 'Generate a silent copy of a video while keeping the picture.' },
  'video-resize': { title: 'Resize video - Naroz', description: 'Resize MP4, MKV, or MOV videos with presets and local export.' },
  'video-speed': { title: 'Change video speed - Naroz', description: 'Adjust MP4, MKV, or MOV videos to 0.5x, 1x, 1.5x, or 2x directly in the browser.' },
  'image-convert': { title: 'Convert image - Naroz', description: 'Convert images between JPG, PNG, WebP, AVIF, GIF, and ICO.' },
  'image-remove-background': { title: 'Remove image background - Naroz', description: 'Try to remove an image background and export it with transparency.' },
  'image-crop': { title: 'Crop image - Naroz', description: 'Crop an image directly in the browser.' },
  'image-transform': { title: 'Rotate or flip image - Naroz', description: 'Rotate and flip images with instant preview.' },
  'document-merge-pdf': { title: 'Merge PDF - Naroz', description: 'Combine multiple PDF files into one final document.' },
  'document-delete-pages': { title: 'Delete PDF pages - Naroz', description: 'Select and remove specific pages from a PDF file.' },
  'document-merge-docx': { title: 'Merge Word - Naroz', description: 'Combine multiple DOCX files in the browser.' },
  'document-msg-to-pdf': { title: 'Convert email to PDF - Naroz', description: 'Convert MSG or EML emails to PDF directly in the browser.' },
  'document-markdown-converter': { title: 'Convert Markdown to PDF or Word - Naroz', description: 'Convert Markdown MD files to PDF or Word DOCX documents directly in the browser.' },
  'document-pdf-to-office': { title: 'Convert PDF to Word, Excel, or PowerPoint - Naroz', description: 'Convert PDF files to DOCX, XLSX, or PPTX directly in the browser.' },
  'document-office-to-pdf': { title: 'Convert Word, Excel, or PowerPoint to PDF - Naroz', description: 'Convert DOCX, XLS, XLSX, or PPTX files to PDF directly in the browser.' },
  'document-excel-column-builder': { title: 'Create Excel from columns - Naroz', description: 'Upload multiple Excel files, select specific columns, and generate a new Excel file directly in the browser with Naroz.' },
  'document-excel-join': { title: 'Join Excel by key column - Naroz', description: 'Combine multiple Excel files using a shared key column and generate a joined file directly in the browser with Naroz.' },
  'utility-qr-generator': { title: 'QR code generator - Naroz', description: 'Create QR codes from links or text and download them as PNG or SVG directly in the browser with Naroz.' },
}

interface StaticSeoPage {
  id: AppToolId
  path: string
  title: string
  description: string
}

const spanishSeoByTool = Object.fromEntries(
  (staticSeoPages as StaticSeoPage[]).map((page) => [page.id, { title: page.title, description: page.description }]),
) as Record<AppToolId, { title: string; description: string }>

export function getSeoContent(locale: Locale, tool: AppToolId = 'home') {
  return {
    ...(locale === 'es' ? spanishSeoByTool[tool] : englishSeoByTool[tool]),
    canonicalPath: getToolPath(tool),
  }
}

export function getStructuredData(locale: Locale, tool: AppToolId = 'home') {
  const { title, description, canonicalPath } = getSeoContent(locale, tool)
  const siteUrl = getSiteUrl()
  const canonicalUrl = getCanonicalUrl(canonicalPath)
  const websiteId = `${siteUrl}/#website`
  const applicationId = `${siteUrl}/#webapp`

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': websiteId,
        url: `${siteUrl}/`,
        name: SEO_SITE_NAME,
        alternateName: ['Naroz App'],
        inLanguage: ['es', 'en'],
      },
      {
        '@type': 'WebApplication',
        '@id': applicationId,
        url: `${siteUrl}/`,
        name: SEO_SITE_NAME,
        description: getSeoContent(locale, 'home').description,
        applicationCategory: 'UtilitiesApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript and an HTML5-compatible browser.',
        image: getOgImageUrl(),
        isAccessibleForFree: true,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
      {
        '@type': 'WebPage',
        '@id': `${canonicalUrl}#webpage`,
        url: canonicalUrl,
        name: title,
        description,
        inLanguage: locale,
        isPartOf: { '@id': websiteId },
        mainEntity: { '@id': applicationId },
      },
    ],
  }
}

export function getIndexedPaths() {
  return Object.values(TOOL_PATHS)
}
