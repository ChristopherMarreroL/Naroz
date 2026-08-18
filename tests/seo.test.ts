import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'

import {
  getCanonicalUrl,
  getSeoContent,
  getStructuredData,
  SEO_DEFAULT_SITE_URL,
} from '../src/lib/seo'
import { applyNotFoundSeo } from '../src/lib/seoDom'
import { renderNotFoundHtml, renderSeoPageHtml, seoPages } from '../scripts/seo-pages.mjs'
import { findToolFromPath } from '../src/lib/routes'

describe('SEO identity', () => {
  test('uses the official domain as the single canonical host', () => {
    expect(SEO_DEFAULT_SITE_URL).toBe('https://naroz.app')
    expect(getCanonicalUrl('/video-convert')).toBe('https://naroz.app/video-convert/')
  })

  test('describes Naroz as a website and free web application', () => {
    const structuredData = getStructuredData('es', 'home')
    const graph = structuredData['@graph']

    expect(graph[0]).toMatchObject({
      '@type': 'WebSite',
      name: 'Naroz',
      url: 'https://naroz.app/',
    })
    expect(graph[1]).toMatchObject({
      '@type': 'WebApplication',
      name: 'Naroz',
      applicationCategory: 'UtilitiesApplication',
      isAccessibleForFree: true,
      offers: { price: '0', priceCurrency: 'USD' },
    })
  })

  test('keeps static crawler signals aligned with the canonical host', async () => {
    const [html, robots, sitemap, vercel] = await Promise.all([
      Bun.file('index.html').text(),
      Bun.file('public/robots.txt').text(),
      Bun.file('public/sitemap.xml').text(),
      Bun.file('vercel.json').text(),
    ])

    expect(html).toContain('<link rel="canonical" href="https://naroz.app/"')
    expect(html).toContain('"@type": "WebSite"')
    expect(html).toContain('"@type": "WebApplication"')
    expect(robots).toContain('Sitemap: https://naroz.app/sitemap.xml')
    expect(sitemap).toContain('<loc>https://naroz.app/</loc>')
    const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
    expect(sitemapUrls).toEqual(seoPages.map((page) => `https://naroz.app${page.path === '/' ? '/' : `${page.path}/`}`))
    expect(vercel).toContain('"cleanUrls": true')
    expect(`${html}\n${robots}\n${sitemap}`).not.toContain('www.naroz.app')
    expect(`${html}\n${robots}\n${sitemap}`).not.toContain('naroz.netlify.app')
    expect(`${html}\n${robots}\n${sitemap}`).not.toContain('naroz.vercel.app')
    expect(html).not.toContain('fonts.googleapis.com')
    expect(vercel).not.toContain('fonts.gstatic.com')
  })

  test('generates unique static metadata for every public route', async () => {
    expect(seoPages).toHaveLength(22)
    expect(new Set(seoPages.map((page) => page.path)).size).toBe(seoPages.length)

    const sourceHtml = await Bun.file('index.html').text()
    const page = seoPages.find((candidate) => candidate.path === '/video-convert')
    expect(page).toBeDefined()

    const rendered = renderSeoPageHtml(sourceHtml, page!)
    expect(rendered).toContain('<title>Convertir videos online - Naroz</title>')
    expect(rendered).toContain('<h1>Convertir videos online - Naroz</h1>')
    expect(rendered).toContain('<meta name="description" content="Convierte videos entre MP4, MKV y MOV gratis y directamente en tu navegador." />')
    expect(rendered).toContain('<meta property="og:description" content="Convierte videos entre MP4, MKV y MOV gratis y directamente en tu navegador." />')
    expect(rendered).toContain('<meta name="twitter:description" content="Convierte videos entre MP4, MKV y MOV gratis y directamente en tu navegador." />')
    expect(rendered).toContain('<link rel="canonical" href="https://naroz.app/video-convert/" />')
    expect(rendered).toContain('"@id": "https://naroz.app/video-convert/#webpage"')
    expect(rendered).not.toContain('<link rel="canonical" href="https://naroz.app/" />')
  })

  test('keeps one canonical, description, title, and valid JSON-LD graph per public page', async () => {
    const sourceHtml = await Bun.file('index.html').text()

    for (const page of seoPages) {
      const document = new JSDOM(renderSeoPageHtml(sourceHtml, page)).window.document
      const structuredDataElement = document.querySelector('#naroz-structured-data')
      const structuredData = JSON.parse(structuredDataElement?.textContent ?? '')

      expect(document.querySelectorAll('title')).toHaveLength(1)
      expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1)
      expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
      expect(document.querySelectorAll('#naroz-structured-data')).toHaveLength(1)
      expect(structuredData['@graph']).toHaveLength(3)
      expect(structuredData['@graph'].filter((item: { '@type': string }) => item['@type'] === 'WebSite')).toHaveLength(1)
      expect(structuredData['@graph'].filter((item: { '@type': string }) => item['@type'] === 'WebApplication')).toHaveLength(1)
      expect(structuredData['@graph'].filter((item: { '@type': string }) => item['@type'] === 'WebPage')).toHaveLength(1)
      expect(document.documentElement.outerHTML).not.toContain('www.naroz.app')
    }
  })

  test('uses the same Spanish metadata before and after React loads', () => {
    for (const page of seoPages) {
      expect(getSeoContent('es', page.id)).toMatchObject({
        title: page.title,
        description: page.description,
        canonicalPath: page.path,
      })
    }
  })

  test('generates a noindex 404 and does not map unknown paths to home', async () => {
    const sourceHtml = await Bun.file('index.html').text()
    const rendered = renderNotFoundHtml(sourceHtml)

    expect(findToolFromPath('/missing-page')).toBeNull()
    expect(rendered).toContain('<meta name="robots" content="noindex, nofollow" />')
    expect(rendered).toContain('<title>Pagina no encontrada - Naroz</title>')
    expect(rendered).toContain('<meta name="description" content="La direccion solicitada no existe o fue movida." />')
    expect(rendered).toContain('<meta property="og:title" content="Pagina no encontrada - Naroz" />')
    expect(rendered).toContain('<meta property="og:description" content="La direccion solicitada no existe o fue movida." />')
    expect(rendered).toContain('<meta name="twitter:title" content="Pagina no encontrada - Naroz" />')
    expect(rendered).toContain('<meta name="twitter:description" content="La direccion solicitada no existe o fue movida." />')
    expect(rendered).not.toContain('property="og:url"')
    expect(rendered).not.toContain('Naroz: herramientas para convertir y transformar archivos')
    expect(rendered).not.toContain('rel="canonical"')
  })

  test('replaces stale social metadata when SPA navigation reaches an unknown path', () => {
    const dom = new JSDOM(`<!doctype html><html><head>
      <title>Old page</title>
      <meta name="description" content="Old description" />
      <meta property="og:title" content="Old page" />
      <meta property="og:description" content="Old description" />
      <meta property="og:url" content="https://naroz.app/old-page/" />
      <meta name="twitter:title" content="Old page" />
      <meta name="twitter:description" content="Old description" />
      <link rel="canonical" href="https://naroz.app/old-page/" />
      <script id="naroz-structured-data" type="application/ld+json">{"old":true}</script>
    </head><body></body></html>`)
    const hadDocument = 'document' in globalThis
    const previousDocument = globalThis.document
    Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.window.document })

    try {
      applyNotFoundSeo('en')

      expect(dom.window.document.title).toBe('Page not found - Naroz')
      expect(dom.window.document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('The requested address does not exist or has been moved.')
      expect(dom.window.document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('Page not found - Naroz')
      expect(dom.window.document.querySelector('meta[name="twitter:title"]')?.getAttribute('content')).toBe('Page not found - Naroz')
      expect(dom.window.document.querySelector('meta[property="og:url"]')).toBeNull()
      expect(dom.window.document.querySelector('link[rel="canonical"]')).toBeNull()
      expect(dom.window.document.querySelector('#naroz-structured-data')).toBeNull()
    } finally {
      if (hadDocument) {
        Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument })
      } else {
        Reflect.deleteProperty(globalThis, 'document')
      }
    }
  })
})
