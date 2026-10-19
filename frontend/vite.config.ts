/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Address used in the default link-preview tags of index.html (Facebook, LinkedIn and X read only
// the static HTML, and they need a full address). Load the same VITE_SITE_URL as the client
// so build-time previews and browser metadata agree on the production domain.
const DEFAULT_SITE_URL = 'https://assethive3d.com'

function siteUrlInHtml(mode: string): Plugin {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const siteUrl = (env.VITE_SITE_URL?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, '')
  return {
    name: 'site-url-in-html',
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl),
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), siteUrlInHtml(mode)],
  server: {
    // Same-origin `/api` (incl. `/api/v1`) in local dev so httpOnly refresh cookies work.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: true,
    restoreMocks: true,
  },
}))
