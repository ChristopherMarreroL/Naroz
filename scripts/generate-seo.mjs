import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const DEFAULT_SITE_URL = 'https://naroz.netlify.app'

function normalizeSiteUrl(value) {
  return value.replace(/\/$/, '')
}

const siteUrl = normalizeSiteUrl(process.env.VITE_SITE_URL || DEFAULT_SITE_URL)
const publicDir = resolve(process.cwd(), 'public')

const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`

await mkdir(publicDir, { recursive: true })
await writeFile(resolve(publicDir, 'robots.txt'), robots, 'utf8')
await writeFile(resolve(publicDir, 'sitemap.xml'), sitemap, 'utf8')

process.stdout.write(`SEO files generated for ${siteUrl}\n`)
