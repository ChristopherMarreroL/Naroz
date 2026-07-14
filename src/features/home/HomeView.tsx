import { useState } from 'react'

import type { AppToolId } from '../../types/app'
import { useLocale } from '../../i18n/LocaleProvider'
import { ToolIcon } from '../../components/shared/ToolIcon'
import narozLogo from '../../assets/naroz-logo.jpg'

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
      <section className="home-hero">
        <div className="home-hero-copy">
          <div className="home-eyebrow">
            <span className="home-eyebrow-dot" />
            {availableTools.length} {t('activeCount')} · {locale === 'es' ? 'Procesamiento local' : 'Local processing'}
          </div>

          <h1>
            {locale === 'es' ? 'Tus archivos,' : 'Your files,'}
            <span>{locale === 'es' ? ' listos sin complicaciones.' : ' ready without the hassle.'}</span>
          </h1>
          <p>{t('homeDescription')} {locale === 'es' ? 'Rápido, privado y directamente en tu navegador.' : 'Fast, private, and directly in your browser.'}</p>

          <div className="home-hero-actions">
            <button type="button" className="btn-primary" onClick={() => onNavigate('image-convert')}>
              {locale === 'es' ? 'Convertir una imagen' : 'Convert an image'}
              <span aria-hidden="true">→</span>
            </button>
            <a href="#herramientas" className="btn-secondary">
              {locale === 'es' ? 'Ver herramientas' : 'Browse tools'}
            </a>
          </div>

          <div className="home-trust-row" aria-label={locale === 'es' ? 'Ventajas de Naroz' : 'Naroz benefits'}>
            <span>{locale === 'es' ? 'Sin registro' : 'No sign-up'}</span>
            <span>{locale === 'es' ? 'Archivos privados' : 'Private files'}</span>
            <span>{locale === 'es' ? 'Descarga inmediata' : 'Instant download'}</span>
          </div>
        </div>

        <div className="conversion-bench" aria-hidden="true">
          <div className="bench-windowbar">
            <span className="bench-dots"><i /><i /><i /></span>
            <span>Naroz / local</span>
            <span className="bench-live"><i /> {locale === 'es' ? 'Listo' : 'Ready'}</span>
          </div>

          <div className="bench-workspace">
            <div className="file-ticket file-ticket-source">
              <span className="ticket-kicker">{locale === 'es' ? 'Entrada' : 'Input'}</span>
              <div className="ticket-file-icon">
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" strokeWidth="1.8">
                  <rect x="4" y="5" width="16" height="14" rx="2" />
                  <path d="m7 15 3-3 2.5 2.5L15 12l3 3" />
                </svg>
              </div>
              <div className="ticket-copy">
                <strong>naroz-proyecto.png</strong>
                <span>PNG · 4.2 MB</span>
              </div>
              <span className="ticket-status">PNG</span>
            </div>

            <div className="conversion-rail">
              <span className="rail-line"><i /></span>
              <div className="converter-mark">
                <img src={narozLogo} alt="" decoding="async" fetchPriority="high" />
              </div>
              <span className="rail-label">{locale === 'es' ? 'Conversión local' : 'Local conversion'}</span>
            </div>

            <div className="file-ticket file-ticket-result">
              <span className="ticket-kicker">{locale === 'es' ? 'Salida' : 'Output'}</span>
              <div className="ticket-file-icon ticket-file-icon-result">
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" strokeWidth="1.8">
                  <path d="M5 12.5 9.2 17 19 7" />
                </svg>
              </div>
              <div className="ticket-copy">
                <strong>naroz-proyecto.webp</strong>
                <span>WebP · 1.1 MB</span>
              </div>
              <span className="ticket-status ticket-status-ready">{locale === 'es' ? 'Listo' : 'Ready'}</span>
            </div>

            <div className="bench-tool-network">
              <span className="network-title">{locale === 'es' ? 'Más flujos disponibles' : 'More available flows'}</span>
              <div className="bench-tool-grid">
                <span className="mini-flow"><strong>PDF</strong><i>→</i>{locale === 'es' ? 'Unir' : 'Merge'}</span>
                <span className="mini-flow"><strong>MP4</strong><i>→</i>MP3</span>
                <span className="mini-flow"><strong>XLSX</strong><i>→</i>JOIN</span>
                <span className="mini-flow"><strong>URL</strong><i>→</i>QR</span>
              </div>
            </div>
          </div>

          <div className="bench-footer">
            <span className="bench-shield">
              <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" strokeWidth="1.8">
                <path d="M12 3 5.5 6v5.5c0 4.2 2.6 7.2 6.5 9.5 3.9-2.3 6.5-5.3 6.5-9.5V6Z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </span>
            <span>
              <strong>100% local</strong>
              {locale === 'es' ? 'Tus archivos no salen del navegador' : 'Your files stay in the browser'}
            </span>
          </div>
        </div>
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
