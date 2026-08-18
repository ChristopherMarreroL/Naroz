import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { renderNotFoundHtml, renderSeoPageHtml, seoPages, SEO_SITE_URL } from './seo-pages.mjs'

const distDir = resolve(process.cwd(), 'dist')
const sourceHtml = await readFile(resolve(distDir, 'index.html'), 'utf8')

for (const page of seoPages) {
  if (page.path === '/') continue
  const outputDir = resolve(distDir, page.path.slice(1))
  await mkdir(outputDir, { recursive: true })
  await writeFile(resolve(outputDir, 'index.html'), renderSeoPageHtml(sourceHtml, page), 'utf8')
}

await writeFile(resolve(distDir, '404.html'), renderNotFoundHtml(sourceHtml), 'utf8')

process.stdout.write(`Static SEO pages generated for ${SEO_SITE_URL}\n`)
