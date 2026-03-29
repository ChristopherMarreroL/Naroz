import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const DEFAULT_SITE_URL = 'https://naroz.vercel.app'
const routes = [
  '/',
  '/video-merge',
  '/video-convert',
  '/video-trim',
  '/video-extract-audio',
  '/video-remove-audio',
  '/video-resize',
  '/image-convert',
  '/image-remove-background',
  '/image-crop',
  '/image-transform',
  '/document-merge-pdf',
  '/document-delete-pages',
  '/document-merge-docx',
 ]

function normalizeSiteUrl(value) {
  return value.replace(/\/$/, '')
}

const siteUrl = normalizeSiteUrl(process.env.VITE_SITE_URL || DEFAULT_SITE_URL)
const publicDir = resolve(process.cwd(), 'public')

const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`

const sitemapEntries = routes
  .map((route) => `  <url>
    <loc>${siteUrl}${route === '/' ? '/' : route}</loc>
    <changefreq>weekly</changefreq>
    <priority>${route === '/' ? '1.0' : '0.8'}</priority>
  </url>`)
  .join('\n')

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</urlset>
`

const redirects = `/*    /index.html   200
`

await mkdir(publicDir, { recursive: true })
await writeFile(resolve(publicDir, 'robots.txt'), robots, 'utf8')
await writeFile(resolve(publicDir, 'sitemap.xml'), sitemap, 'utf8')
await writeFile(resolve(publicDir, '_redirects'), redirects, 'utf8')

process.stdout.write(`SEO files generated for ${siteUrl}\n`)
