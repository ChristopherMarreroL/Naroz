import { useState } from 'react'

import type { AppToolId } from '../../types/app'
import { useLocale } from '../../i18n/LocaleProvider'
import { ToolIcon } from '../../components/shared/ToolIcon'
import { HomeProductDemo } from './HomeProductDemo'

interface HomeViewProps {
  onNavigate: (tool: AppToolId) => void
}

const availableTools = [
  {
    id: 'video-merge' as const,
    category: 'video',
    status: 'stable',
  },
  {
    id: 'video-convert' as const,
    category: 'video',
    status: 'stable',
  },
  {
    id: 'video-extract-audio' as const,
    category: 'video',
    status: 'stable',
  },
  {
    id: 'video-remove-audio' as const,
    category: 'video',
    status: 'stable',
  },
  {
    id: 'video-resize' as const,
    category: 'video',
    status: 'stable',
  },
  {
    id: 'video-speed' as const,
    category: 'video',
    status: 'beta',
  },
  {
    id: 'image-convert' as const,
    category: 'image',
    status: 'stable',
  },
  {
    id: 'image-remove-background' as const,
    category: 'image',
    status: 'beta',
  },
  {
    id: 'image-crop' as const,
    category: 'image',
    status: 'stable',
  },
  {
    id: 'image-transform' as const,
    category: 'image',
    status: 'stable',
  },
  {
    id: 'document-merge-pdf' as const,
    category: 'document',
    status: 'stable',
  },
  {
    id: 'document-delete-pages' as const,
    category: 'document',
    status: 'beta',
  },
  {
    id: 'document-merge-docx' as const,
    category: 'document',
    status: 'beta',
  },
  {
    id: 'document-msg-to-pdf' as const,
    category: 'document',
    status: 'beta',
  },
  {
    id: 'document-markdown-converter' as const,
    category: 'document',
    status: 'beta',
  },
  {
    id: 'document-pdf-to-office' as const,
    category: 'document',
    status: 'beta',
  },
  {
    id: 'document-office-to-pdf' as const,
    category: 'document',
    status: 'beta',
  },
  {
    id: 'document-excel-column-builder' as const,
    category: 'document',
    status: 'stable',
  },
  {
    id: 'document-excel-join' as const,
    category: 'document',
    status: 'stable',
  },
  {
    id: 'video-trim' as const,
    category: 'video',
    status: 'beta',
  },
  {
    id: 'utility-qr-generator' as const,
    category: 'utility',
    status: 'stable',
  },
]

function getToolTitle(id: AppToolId, locale: 'es' | 'en') {
  if (id === 'video-merge') return locale === 'es' ? 'Unir videos' : 'Merge videos'
  if (id === 'video-convert') return locale === 'es' ? 'Convertir formato' : 'Convert format'
  if (id === 'video-extract-audio') return locale === 'es' ? 'Extraer audio' : 'Extract audio'
  if (id === 'video-remove-audio') return locale === 'es' ? 'Eliminar audio' : 'Remove audio'
  if (id === 'video-resize') return locale === 'es' ? 'Cambiar resolucion' : 'Change resolution'
  if (id === 'video-speed') return locale === 'es' ? 'Cambiar velocidad' : 'Change speed'
  if (id === 'video-trim') return locale === 'es' ? 'Recortar video' : 'Trim video'
  if (id === 'image-crop') return locale === 'es' ? 'Recortar imagen' : 'Crop image'
  if (id === 'image-transform') return locale === 'es' ? 'Rotar / voltear imagen' : 'Rotate / flip image'
  if (id === 'image-remove-background') return locale === 'es' ? 'Remover fondo' : 'Remove background'
  if (id === 'document-merge-pdf') return locale === 'es' ? 'Unir PDF' : 'Merge PDF'
  if (id === 'document-delete-pages') return locale === 'es' ? 'Eliminar paginas' : 'Delete pages'
  if (id === 'document-merge-docx') return locale === 'es' ? 'Unir Word' : 'Merge Word'
  if (id === 'document-msg-to-pdf') return locale === 'es' ? 'Convertir correo a PDF' : 'Convert email to PDF'
  if (id === 'document-markdown-converter') return locale === 'es' ? 'Markdown a PDF o Word' : 'Markdown to PDF or Word'
  if (id === 'document-pdf-to-office') return locale === 'es' ? 'PDF a Word, Excel o PowerPoint' : 'PDF to Word, Excel, or PowerPoint'
  if (id === 'document-office-to-pdf') return locale === 'es' ? 'Word, Excel o PowerPoint a PDF' : 'Word, Excel, or PowerPoint to PDF'
  if (id === 'document-excel-column-builder') return locale === 'es' ? 'Crear Excel desde columnas' : 'Create Excel from columns'
  if (id === 'document-excel-join') return locale === 'es' ? 'Cruzar Excel por columna clave' : 'Join Excel by key column'
  if (id === 'utility-qr-generator') return locale === 'es' ? 'Generador de codigo QR' : 'QR code generator'
  return locale === 'es' ? 'Convertir formato' : 'Convert format'
}

function getToolDescription(id: AppToolId, locale: 'es' | 'en') {
  if (id === 'video-merge') return locale === 'es' ? 'Combina varios MP4, MKV o MOV en un unico archivo final directamente en el navegador.' : 'Combine multiple MP4, MKV, or MOV files into one final file directly in the browser.'
  if (id === 'video-convert') return locale === 'es' ? 'Convierte un solo video entre MP4, MKV y MOV desde el navegador.' : 'Convert a single video between MP4, MKV, and MOV right in the browser.'
  if (id === 'video-extract-audio') return locale === 'es' ? 'Separa el audio de un video MP4, MKV o MOV y exportalo en MP3 o WAV.' : 'Separate audio from an MP4, MKV, or MOV video and export it as MP3 or WAV.'
  if (id === 'video-remove-audio') return locale === 'es' ? 'Genera una copia silenciosa de un video MP4, MKV o MOV sin tocar la imagen.' : 'Generate a silent copy of an MP4, MKV, or MOV video without changing the picture.'
  if (id === 'video-resize') return locale === 'es' ? 'Cambia el ancho y alto de un video MP4, MKV o MOV y exporta una nueva version.' : 'Change the width and height of an MP4, MKV, or MOV video and export a resized version.'
  if (id === 'video-speed') return locale === 'es' ? 'Acelera o ralentiza un video MP4, MKV o MOV con salidas a 0.5x, 1x, 1.5x o 2x.' : 'Speed up or slow down an MP4, MKV, or MOV video with 0.5x, 1x, 1.5x, or 2x outputs.'
  if (id === 'video-trim') return locale === 'es' ? 'Recorta un fragmento de un video MP4, MKV o MOV y exporta solo el tramo que necesitas.' : 'Trim one segment from an MP4, MKV, or MOV video and export only the clip you need.'
  if (id === 'image-crop') return locale === 'es' ? 'Recorta una imagen y exporta solo el area que necesitas sin salir del navegador.' : 'Crop one image and export only the area you need directly in the browser.'
  if (id === 'image-transform') return locale === 'es' ? 'Rota una imagen o volteala horizontal y verticalmente antes de descargarla.' : 'Rotate an image or flip it horizontally and vertically before downloading it.'
  if (id === 'image-remove-background') return locale === 'es' ? 'Intenta quitar fondos lisos o uniformes y exporta la imagen en PNG con transparencia.' : 'Attempts to remove plain or uniform backgrounds and exports the image as a transparent PNG.'
  if (id === 'document-merge-pdf') return locale === 'es' ? 'Combina varios PDF en un unico documento final y decide el orden antes de exportar.' : 'Combine multiple PDFs into one final document and choose the order before exporting.'
  if (id === 'document-delete-pages') return locale === 'es' ? 'Selecciona un PDF y elimina paginas especificas antes de descargar una nueva version.' : 'Pick a PDF and remove specific pages before downloading a new version.'
  if (id === 'document-merge-docx') return locale === 'es' ? 'Combina varios archivos DOCX en un solo documento Word desde el navegador.' : 'Combine multiple DOCX files into one Word document in the browser.'
  if (id === 'document-msg-to-pdf') return locale === 'es' ? 'Lee correos .MSG o .EML y genera una version PDF con sus datos principales.' : 'Read .MSG or .EML emails and generate a PDF version with their main details.'
  if (id === 'document-markdown-converter') return locale === 'es' ? 'Convierte archivos .md, como un README, a PDF o Word con vista previa y procesamiento local.' : 'Convert .md files, such as a README, to PDF or Word with preview and local processing.'
  if (id === 'document-pdf-to-office') return locale === 'es' ? 'Convierte un PDF a Word, Excel o PowerPoint directamente en el navegador.' : 'Convert a PDF to Word, Excel, or PowerPoint directly in the browser.'
  if (id === 'document-office-to-pdf') return locale === 'es' ? 'Convierte documentos Word, Excel o PowerPoint a PDF sin salir del navegador.' : 'Convert Word, Excel, or PowerPoint documents to PDF without leaving the browser.'
  if (id === 'document-excel-column-builder') return locale === 'es' ? 'Selecciona columnas de varios archivos Excel y genera un nuevo documento.' : 'Select columns from multiple Excel files and generate a new document.'
  if (id === 'document-excel-join') return locale === 'es' ? 'Combina archivos Excel usando una columna en comun, como ID, cedula, codigo o factura.' : 'Combine Excel files using a shared key column such as ID, code, invoice, or email.'
  if (id === 'utility-qr-generator') return locale === 'es' ? 'Crea codigos QR desde enlaces o texto y descargalos como imagen.' : 'Create QR codes from links or text and download them as an image.'
  return locale === 'es' ? 'Transforma imagenes JPG, PNG, WebP, AVIF, GIF e ICO con vista previa y descarga inmediata.' : 'Convert JPG, PNG, WebP, AVIF, GIF, and ICO images with preview and instant download.'
}

export function HomeView({ onNavigate }: HomeViewProps) {
  const { locale, t } = useLocale()
  const [activeCategory, setActiveCategory] = useState<'all' | 'utility' | 'document' | 'image' | 'video'>('all')
  const sections = [
    { id: 'utility', label: t('utility') },
    { id: 'document', label: t('document') },
    { id: 'image', label: t('image') },
    { id: 'video', label: t('video') },
  ] as const

  const filteredTools = sections.flatMap((section) =>
    availableTools
      .filter((tool) => tool.category === section.id)
      .map((tool) => ({ ...tool, categoryLabel: section.label })),
  ).filter((tool) => activeCategory === 'all' || tool.category === activeCategory)

  const categoryStyles = {
    utility: 'tool-card-utility',
    document: 'tool-card-document',
    image: 'tool-card-image',
    video: 'tool-card-video',
  } as const

  const categoryFilters = [
    { id: 'all' as const, label: locale === 'es' ? 'Todas' : 'All' },
    ...sections,
  ]

  return (
    <>
      <section className="home-hero home-hero-demo">
        <HomeProductDemo locale={locale} onNavigate={onNavigate} />
      </section>

      <section id="herramientas" className="tools-showcase">
        <div className="tools-showcase-header">
          <div>
            <span className="section-kicker">{locale === 'es' ? 'Elige lo que necesitas' : 'Choose what you need'}</span>
            <h2>{t('homeAvailable')}</h2>
            <p>{t('homeIntroDescription')}</p>
          </div>
          <span className="tool-count"><strong>{availableTools.length}</strong> {t('activeCount')}</span>
        </div>

        <div className="category-filters" aria-label={locale === 'es' ? 'Filtrar por categoría' : 'Filter by category'}>
          {categoryFilters.map((category) => (
            <button
              key={category.id}
              type="button"
              className={activeCategory === category.id ? 'category-filter-active' : ''}
              onClick={() => setActiveCategory(category.id)}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className="tools-grid">
          {filteredTools.map((tool) => (
            <article key={tool.id} className={`tool-card ${categoryStyles[tool.category as keyof typeof categoryStyles]}`}>
              <div className="tool-card-topline">
                <span className="tool-category">{tool.categoryLabel}</span>
                {tool.status === 'beta' ? <span className="tool-beta">{t('betaBadge')}</span> : null}
                <span className="tool-icon"><ToolIcon toolId={tool.id} /></span>
              </div>
              <h3>{getToolTitle(tool.id, locale)}</h3>
              <p>{getToolDescription(tool.id, locale)}</p>
              <button type="button" className="tool-card-action" onClick={() => onNavigate(tool.id)}>
                {t('openTool')}
                <span aria-hidden="true">↗</span>
              </button>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
