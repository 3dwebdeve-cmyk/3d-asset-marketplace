/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Address used in the default link-preview tags of index.html (Facebook, LinkedIn and X read only
// the static HTML, and they need a full address). Set VITE_SITE_URL in the build settings to the
// real domain (for example https://assethive3d.com) once it exists.
const DEFAULT_SITE_URL = 'https://3d-asset-marketplace.super-frog-4be8.workers.dev'

function siteUrlInHtml(): Plugin {
  const siteUrl = (process.env.VITE_SITE_URL?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, '')
  return {
    name: 'site-url-in-html',
    transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', siteUrl),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), siteUrlInHtml()],
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
})
