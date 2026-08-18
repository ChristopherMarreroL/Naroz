import { describe, expect, test } from 'bun:test'

import {
  getCanonicalUrl,
  getStructuredData,
  SEO_DEFAULT_SITE_URL,
} from '../src/lib/seo'

describe('SEO identity', () => {
  test('uses the public www domain as the single canonical host', () => {
    expect(SEO_DEFAULT_SITE_URL).toBe('https://www.naroz.app')
    expect(getCanonicalUrl('/video-convert')).toBe('https://www.naroz.app/video-convert')
  })

  test('describes Naroz as a website and free web application', () => {
    const structuredData = getStructuredData('es', 'home')
    const graph = structuredData['@graph']

    expect(graph[0]).toMatchObject({
      '@type': 'WebSite',
      name: 'Naroz',
      url: 'https://www.naroz.app/',
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
    const [html, robots, sitemap] = await Promise.all([
      Bun.file('index.html').text(),
      Bun.file('public/robots.txt').text(),
      Bun.file('public/sitemap.xml').text(),
    ])

    expect(html).toContain('<link rel="canonical" href="https://www.naroz.app/"')
    expect(html).toContain('"@type": "WebSite"')
    expect(html).toContain('"@type": "WebApplication"')
    expect(robots).toContain('Sitemap: https://www.naroz.app/sitemap.xml')
    expect(sitemap).toContain('<loc>https://www.naroz.app/</loc>')
    expect(`${html}\n${robots}\n${sitemap}`).not.toContain('naroz.vercel.app')
  })
})
