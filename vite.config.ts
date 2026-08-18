import { existsSync, readFileSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TOOL_PATHS } from './src/lib/routes'

const previewPaths = new Set(Object.values(TOOL_PATHS))
const previewDistRoot = resolve(process.cwd(), 'dist')

function isExistingPreviewFile(pathname: string) {
  try {
    const candidate = resolve(previewDistRoot, `.${pathname}`)
    const relativePath = relative(previewDistRoot, candidate)
    if (!relativePath || relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
      return false
    }

    return existsSync(candidate) && statSync(candidate).isFile()
  } catch {
    return false
  }
}

const canonicalPreviewRoutes = (): Plugin => ({
  name: 'canonical-preview-routes',
  configurePreviewServer(server) {
    server.middlewares.use((request, response, next) => {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const lastSegment = url.pathname.split('/').pop() ?? ''
      if (lastSegment.includes('.') && isExistingPreviewFile(url.pathname)) {
        next()
        return
      }

      const normalizedPath = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '')
      if (!previewPaths.has(normalizedPath)) {
        response.statusCode = 404
        response.setHeader('Content-Type', 'text/html; charset=utf-8')
        response.end(readFileSync(resolve(process.cwd(), 'dist/404.html'), 'utf8'))
        return
      }

      if (url.pathname !== '/' && !url.pathname.endsWith('/')) {
        response.statusCode = 308
        response.setHeader('Location', `${url.pathname}/${url.search}`)
        response.end()
        return
      }

      next()
    })
  },
})

export default defineConfig({
  plugins: [canonicalPreviewRoutes(), react(), tailwindcss()],
  build: {
    modulePreload: {
      polyfill: false,
    },
    minify: 'oxc',
  },
  resolve: {
    alias: {
      buffer: 'buffer',
    },
  },
  define: {
    global: 'globalThis',
  },
})
