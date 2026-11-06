import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

import { ROBOTS_DISALLOW, SITEMAP_PATHS } from './src/seo/pages'

/**
 * robots.txt and sitemap.xml for search engines, built from src/seo/pages.ts. The site's address is
 * VITE_SITE_URL (set it on Vercel to the purchased domain at launch); until then the Vercel address.
 */
function searchFiles(siteUrl: string): Plugin {
  const base = siteUrl.replace(/\/+$/, '')
  const today = new Date().toISOString().slice(0, 10)
  const robots = [
    'User-agent: *',
    'Allow: /',
    ...ROBOTS_DISALLOW.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n')
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...SITEMAP_PATHS.map(
      (path) =>
        `  <url><loc>${base}${path === '/' ? '/' : path}</loc><lastmod>${today}</lastmod></url>`,
    ),
    '</urlset>',
    '',
  ].join('\n')
  const files: Record<string, [string, string]> = {
    '/robots.txt': [robots, 'text/plain; charset=utf-8'],
    '/sitemap.xml': [sitemap, 'application/xml; charset=utf-8'],
  }
  return {
    name: 'search-files',
    // `vite` (dev server): serve them
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const file = files[((req as { url?: string }).url ?? '').split('?')[0]]
        if (!file) return next()
        res.setHeader('Content-Type', file[1])
        res.end(file[0])
      })
    },
    // `vite build`: write them next to index.html
    generateBundle() {
      for (const [path, [source]] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName: path.slice(1), source })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      searchFiles(env.VITE_SITE_URL || 'https://carriersafetyscan.vercel.app'),
    ],
    server: {
      host: true,
      port: 5173,
      proxy: {
        // The frontend calls /api/...; Vite forwards it to FastAPI, so no CORS setup is needed in dev.
        '/api': env.API_PROXY_TARGET || 'http://localhost:8000',
      },
    },
  }
})
