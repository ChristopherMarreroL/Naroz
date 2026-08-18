import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { seoPages, SEO_SITE_URL } from './seo-pages.mjs'

const DEFAULT_SITE_URL = SEO_SITE_URL

function normalizeSiteUrl(value) {
  return value.replace(/\/$/, '')
}

const siteUrl = normalizeSiteUrl(process.env.VITE_SITE_URL || DEFAULT_SITE_URL)
const publicDir = resolve(process.cwd(), 'public')

const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`

const sitemapEntries = seoPages
  .map((page) => `  <url>
    <loc>${siteUrl}${page.path === '/' ? '/' : `${page.path}/`}</loc>
    <changefreq>weekly</changefreq>
    <priority>${page.path === '/' ? '1.0' : '0.8'}</priority>
  </url>`)
  .join('\n')

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapEntries}
</urlset>
`

const redirects = `/*    /404.html   404
`

await mkdir(publicDir, { recursive: true })
await writeFile(resolve(publicDir, 'robots.txt'), robots, 'utf8')
await writeFile(resolve(publicDir, 'sitemap.xml'), sitemap, 'utf8')
await writeFile(resolve(publicDir, '_redirects'), redirects, 'utf8')

process.stdout.write(`SEO files generated for ${siteUrl}\n`)
