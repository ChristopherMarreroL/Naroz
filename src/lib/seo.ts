import type { Locale } from '../i18n/LocaleProvider'
import type { AppToolId } from '../types/app'
import { TOOL_PATHS, getToolPath } from './routes'

export const SEO_SITE_NAME = 'Naroz'
export const SEO_DEFAULT_SITE_URL = 'https://naroz.vercel.app'
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

export function getCanonicalUrl(pathname = '/') {
  return `${getSiteUrl()}${pathname === '/' ? '/' : pathname}`
}

const seoByTool: Record<AppToolId, Record<Locale, { title: string; description: string }>> = {
  home: {
    es: {
      title: 'Naroz - Convierte y transforma archivos facilmente',
      description: 'Naroz es una herramienta web para convertir, unir y transformar archivos de video e imagen facilmente desde el navegador.',
    },
    en: {
      title: 'Naroz - Convert and transform files easily',
      description: 'Naroz is a web tool to convert, merge, and transform video and image files easily right in the browser.',
    },
  },
  'video-merge': {
    es: { title: 'Unir videos - Naroz', description: 'Une varios videos MP4 o MKV en una sola exportacion desde el navegador.' },
    en: { title: 'Merge videos - Naroz', description: 'Merge multiple MP4 or MKV videos into one export directly in the browser.' },
  },
  'video-convert': {
    es: { title: 'Convertir video - Naroz', description: 'Convierte videos entre MP4 y MKV desde una sola herramienta web.' },
    en: { title: 'Convert video - Naroz', description: 'Convert videos between MP4 and MKV from a single web tool.' },
  },
  'video-trim': {
    es: { title: 'Recortar video - Naroz', description: 'Recorta un fragmento de video con vista previa y exportacion local.' },
    en: { title: 'Trim video - Naroz', description: 'Trim a video segment with preview and local export.' },
  },
  'video-extract-audio': {
    es: { title: 'Extraer audio - Naroz', description: 'Extrae el audio de un video MP4 o MKV y descargalo como MP3 o WAV.' },
    en: { title: 'Extract audio - Naroz', description: 'Extract audio from an MP4 or MKV video and download it as MP3 or WAV.' },
  },
  'video-remove-audio': {
    es: { title: 'Eliminar audio - Naroz', description: 'Genera una copia silenciosa de un video manteniendo la imagen.' },
    en: { title: 'Remove audio - Naroz', description: 'Generate a silent copy of a video while keeping the picture.' },
  },
  'video-resize': {
    es: { title: 'Cambiar resolucion de video - Naroz', description: 'Redimensiona videos MP4 o MKV con presets y exportacion local.' },
    en: { title: 'Resize video - Naroz', description: 'Resize MP4 or MKV videos with presets and local export.' },
  },
  'image-convert': {
    es: { title: 'Convertir imagen - Naroz', description: 'Convierte imagenes entre JPG, PNG, WebP, AVIF, GIF e ICO.' },
    en: { title: 'Convert image - Naroz', description: 'Convert images between JPG, PNG, WebP, AVIF, GIF, and ICO.' },
  },
  'image-remove-background': {
    es: { title: 'Quitar fondo de imagen - Naroz', description: 'Intenta remover el fondo de una imagen y exportarla con transparencia.' },
    en: { title: 'Remove image background - Naroz', description: 'Try to remove an image background and export it with transparency.' },
  },
  'image-crop': {
    es: { title: 'Recortar imagen - Naroz', description: 'Recorta una imagen directamente desde el navegador.' },
    en: { title: 'Crop image - Naroz', description: 'Crop an image directly in the browser.' },
  },
  'image-transform': {
    es: { title: 'Rotar o voltear imagen - Naroz', description: 'Rota y voltea imagenes con vista previa inmediata.' },
    en: { title: 'Rotate or flip image - Naroz', description: 'Rotate and flip images with instant preview.' },
  },
  'document-merge-pdf': {
    es: { title: 'Unir PDF - Naroz', description: 'Combina varios archivos PDF en un solo documento final.' },
    en: { title: 'Merge PDF - Naroz', description: 'Combine multiple PDF files into one final document.' },
  },
  'document-delete-pages': {
    es: { title: 'Eliminar paginas PDF - Naroz', description: 'Selecciona y elimina paginas especificas de un archivo PDF.' },
    en: { title: 'Delete PDF pages - Naroz', description: 'Select and remove specific pages from a PDF file.' },
  },
  'document-merge-docx': {
    es: { title: 'Unir Word - Naroz', description: 'Combina varios archivos DOCX desde el navegador.' },
    en: { title: 'Merge Word - Naroz', description: 'Combine multiple DOCX files in the browser.' },
  },
}

export function getSeoContent(locale: Locale, tool: AppToolId = 'home') {
  const content = seoByTool[tool] ?? seoByTool.home
  return {
    ...content[locale],
    canonicalPath: getToolPath(tool),
  }
}

export function getIndexedPaths() {
  return Object.values(TOOL_PATHS)
}
