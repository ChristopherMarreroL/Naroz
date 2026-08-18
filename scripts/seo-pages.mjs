export const SEO_SITE_URL = 'https://www.naroz.app'

function getCanonicalUrl(path, siteUrl = SEO_SITE_URL) {
  return `${siteUrl}${path === '/' ? '/' : `${path}/`}`
}

export const seoPages = [
  { id: 'home', path: '/', title: 'Naroz: herramientas online para PDF, video e imágenes', description: 'Convierte, une y transforma PDF, Word, Excel, videos e imágenes gratis y de forma privada, directamente en tu navegador con Naroz.' },
  { id: 'video-merge', path: '/video-merge', title: 'Unir videos online gratis - Naroz', description: 'Une varios videos MP4, MKV o MOV en un único archivo directamente en tu navegador.' },
  { id: 'video-convert', path: '/video-convert', title: 'Convertir videos online - Naroz', description: 'Convierte videos entre MP4, MKV y MOV gratis y directamente en tu navegador.' },
  { id: 'video-trim', path: '/video-trim', title: 'Recortar videos online - Naroz', description: 'Recorta un fragmento de video con vista previa y procesamiento local en tu navegador.' },
  { id: 'video-extract-audio', path: '/video-extract-audio', title: 'Extraer audio de video - Naroz', description: 'Extrae el audio de videos MP4, MKV o MOV y descárgalo como MP3 o WAV.' },
  { id: 'video-remove-audio', path: '/video-remove-audio', title: 'Quitar audio de un video - Naroz', description: 'Elimina el sonido de un video y descarga una copia silenciosa desde el navegador.' },
  { id: 'video-resize', path: '/video-resize', title: 'Cambiar resolución de video - Naroz', description: 'Redimensiona videos MP4, MKV o MOV con presets y procesamiento local.' },
  { id: 'video-speed', path: '/video-speed', title: 'Cambiar velocidad de video - Naroz', description: 'Acelera o ralentiza videos directamente en tu navegador con Naroz.' },
  { id: 'image-convert', path: '/image-convert', title: 'Convertir imágenes online gratis - Naroz', description: 'Convierte imágenes entre JPG, PNG, WebP, AVIF, GIF, ICO y SVG desde el navegador.' },
  { id: 'image-remove-background', path: '/image-remove-background', title: 'Quitar fondo de imagen online - Naroz', description: 'Elimina automáticamente el fondo de una imagen y expórtala con transparencia.' },
  { id: 'image-crop', path: '/image-crop', title: 'Recortar imágenes online - Naroz', description: 'Recorta imágenes de forma visual, privada y directamente en tu navegador.' },
  { id: 'image-transform', path: '/image-transform', title: 'Rotar y voltear imágenes - Naroz', description: 'Rota y voltea imágenes online con vista previa y procesamiento local.' },
  { id: 'document-merge-pdf', path: '/document-merge-pdf', title: 'Unir archivos PDF online - Naroz', description: 'Combina varios archivos PDF en un único documento directamente en tu navegador.' },
  { id: 'document-delete-pages', path: '/document-delete-pages', title: 'Eliminar páginas de un PDF - Naroz', description: 'Selecciona y elimina páginas específicas de un PDF de forma local y privada.' },
  { id: 'document-merge-docx', path: '/document-merge-docx', title: 'Unir documentos Word online - Naroz', description: 'Combina varios documentos DOCX en un único archivo desde el navegador.' },
  { id: 'document-msg-to-pdf', path: '/msg-to-pdf', title: 'Convertir MSG o EML a PDF - Naroz', description: 'Abre correos MSG o EML y guárdalos como PDF protegiendo tu privacidad.' },
  { id: 'document-markdown-converter', path: '/markdown-converter', title: 'Convertir Markdown a PDF o Word - Naroz', description: 'Convierte archivos Markdown a PDF o DOCX directamente en tu navegador.' },
  { id: 'document-pdf-to-office', path: '/pdf-to-office', title: 'Convertir PDF a Word, Excel o PowerPoint - Naroz', description: 'Convierte archivos PDF a DOCX, XLSX o PPTX con procesamiento local.' },
  { id: 'document-office-to-pdf', path: '/office-to-pdf', title: 'Convertir Word, Excel o PowerPoint a PDF - Naroz', description: 'Convierte DOCX, XLS, XLSX o PPTX a PDF directamente en tu navegador.' },
  { id: 'document-excel-column-builder', path: '/excel-column-builder', title: 'Crear Excel seleccionando columnas - Naroz', description: 'Selecciona columnas de varios archivos Excel y genera un nuevo libro desde el navegador.' },
  { id: 'document-excel-join', path: '/excel-join', title: 'Cruzar archivos Excel por una columna - Naroz', description: 'Combina varios archivos Excel mediante una columna clave y descarga el resultado.' },
  { id: 'utility-qr-generator', path: '/qr-generator', title: 'Generador de códigos QR gratis - Naroz', description: 'Crea códigos QR desde texto o enlaces y descárgalos como PNG o SVG.' },
]

function escapeHtml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function createStructuredData(page, siteUrl = SEO_SITE_URL) {
  const canonicalUrl = getCanonicalUrl(page.path, siteUrl)
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${siteUrl}/#website`, url: `${siteUrl}/`, name: 'Naroz', alternateName: ['Naroz App'], inLanguage: ['es', 'en'] },
      {
        '@type': 'WebApplication', '@id': `${siteUrl}/#webapp`, url: `${siteUrl}/`, name: 'Naroz',
        description: seoPages[0].description, applicationCategory: 'UtilitiesApplication', operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript and an HTML5-compatible browser.', image: `${siteUrl}/og-image.png`,
        isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
      {
        '@type': 'WebPage', '@id': `${canonicalUrl}#webpage`, url: canonicalUrl, name: page.title,
        description: page.description, inLanguage: 'es', isPartOf: { '@id': `${siteUrl}/#website` },
        mainEntity: { '@id': `${siteUrl}/#webapp` },
      },
    ],
  }
}

export function renderSeoPageHtml(sourceHtml, page, siteUrl = SEO_SITE_URL) {
  const canonicalUrl = getCanonicalUrl(page.path, siteUrl)
  const title = escapeHtml(page.title)
  const description = escapeHtml(page.description)
  const structuredData = JSON.stringify(createStructuredData(page, siteUrl), null, 2).replace(/</g, '\\u003c')

  return sourceHtml
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/>/, `<link rel="canonical" href="${canonicalUrl}" />`)
    .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/, `<meta name="description" content="${description}" />`)
    .replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/, `<meta property="og:title" content="${title}" />`)
    .replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/, `<meta property="og:description" content="${description}" />`)
    .replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/, `<meta property="og:url" content="${canonicalUrl}" />`)
    .replace(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${title}" />`)
    .replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${description}" />`)
    .replace(/<script id="naroz-structured-data" type="application\/ld\+json">[\s\S]*?<\/script>/, `<script id="naroz-structured-data" type="application/ld+json">${structuredData}</script>`)
    .replace(/<h1>Naroz<\/h1>\s*<p>[\s\S]*?<\/p>/, `<h1>${title}</h1>\n        <p>${description}</p>`)
}

export function renderNotFoundHtml(sourceHtml) {
  const title = 'Pagina no encontrada - Naroz'
  const description = 'La direccion solicitada no existe o fue movida.'

  return sourceHtml
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
    .replace(/<meta\s+name="robots"\s+content="[^"]*"\s*\/>/, '<meta name="robots" content="noindex, nofollow" />')
    .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/>/, `<meta name="description" content="${description}" />`)
    .replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/, `<meta property="og:title" content="${title}" />`)
    .replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/, `<meta property="og:description" content="${description}" />`)
    .replace(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/>/, `<meta name="twitter:title" content="${title}" />`)
    .replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/>/, `<meta name="twitter:description" content="${description}" />`)
    .replace(/\s*<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/, '')
    .replace(/\s*<link rel="canonical" href="[^"]*"\s*\/>/, '')
    .replace(/\s*<script id="naroz-structured-data" type="application\/ld\+json">[\s\S]*?<\/script>/, '')
    .replace(/<h1>Naroz<\/h1>\s*<p>[\s\S]*?<\/p>/, `<h1>${title.replace(' - Naroz', '')}</h1>\n        <p>${description}</p>`)
}
