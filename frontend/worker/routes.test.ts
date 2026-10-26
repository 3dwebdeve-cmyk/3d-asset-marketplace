import { readdirSync, readFileSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { ADMIN_BASE, ADMIN_LOGIN } from '../src/config/adminPaths'
import worker, { type WorkerEnv } from './index'
import { APP_ROUTE_PATTERNS, isKnownAppPath } from './routes'

const SHELL = '<!doctype html><html><head><title>AssetHive3D</title></head><body></body></html>'

function createEnv(): WorkerEnv {
  return {
    BACKEND_ORIGIN: 'https://api.example.test',
    ASSETS: {
      fetch: vi.fn().mockImplementation(async (request: Request) =>
        new Response(request.method === 'HEAD' ? null : SHELL, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
      ),
    },
  }
}

function wranglerConfig(): { assets: { run_worker_first: string[] } } {
  const lines = readFileSync('wrangler.jsonc', 'utf-8').split(/\r?\n/)
  return JSON.parse(lines.filter((line) => !line.trim().startsWith('//')).join('\n'))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('known page addresses', () => {
  it('match the <Route path> list in App.tsx', () => {
    const app = readFileSync('src/App.tsx', 'utf-8')
    const literal = [...app.matchAll(/path="([^"]+)"/g)].map((match) => match[1])
    const admin = [...app.matchAll(/path=\{`\$\{ADMIN_BASE\}([^`]*)`\}/g)].map(
      (match) => `${ADMIN_BASE}${match[1]}`,
    )
    const constants = [...app.matchAll(/path=\{(ADMIN_BASE|ADMIN_LOGIN)\}/g)].map((match) =>
      match[1] === 'ADMIN_BASE' ? ADMIN_BASE : ADMIN_LOGIN,
    )
    const appRoutes = [...literal, ...admin, ...constants].filter((path) => path !== '*')

    expect(new Set(APP_ROUTE_PATTERNS)).toEqual(new Set(appRoutes))
  })

  it.each([
    '/',
    '/about',
    '/ABOUT',
    '/products/desk-lamp',
    '/3d-models/furniture',
    '/reset-password/abc/def-123',
    '/admin',
    '/admin/products/anything',
    '/console/orders/42',
    '/dashboard/orders/7',
  ])('knows %s', (path) => {
    expect(isKnownAppPath(path)).toBe(true)
  })

  it.each([
    '/nothing-here',
    '/about/team',
    '/products/desk-lamp/extra',
    '/reset-password/only-one-part',
    '/console/unknown',
    '/wp-login.php.bak/',
  ])('does not know %s', (path) => {
    expect(isKnownAppPath(path)).toBe(false)
  })
})

describe('unknown addresses', () => {
  it('answer 404 with a noindex page that the app renders as "not found"', async () => {
    const response = await worker.fetch(new Request('https://shop.example/nothing-here'), createEnv())

    expect(response.status).toBe(404)
    expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
    const html = await response.text()
    expect(html).toContain('<title>Page not found | AssetHive3D</title>')
    expect(html).toContain('<head>')
  })

  it('answer 404 to HEAD requests too', async () => {
    const response = await worker.fetch(
      new Request('https://shop.example/nothing-here', { method: 'HEAD' }),
      createEnv(),
    )

    expect(response.status).toBe(404)
    expect(await response.text()).toBe('')
  })

  it('give a product address that cannot exist a 404 without asking the backend', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)

    const response = await worker.fetch(new Request('https://shop.example/products/bad%20name'), createEnv())

    expect(response.status).toBe(404)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('leave known private pages to the app', async () => {
    for (const path of ['/cart', '/dashboard/orders', '/console/login']) {
      const response = await worker.fetch(new Request(`https://shop.example${path}`), createEnv())
      expect(response.status, path).toBe(200)
    }
  })
})

describe('wrangler.jsonc', () => {
  it('sends every page through the Worker', () => {
    expect(wranglerConfig().assets.run_worker_first[0]).toBe('/*')
  })

  it('serves every static folder directly, and only folders that exist', () => {
    const skipped = wranglerConfig()
      .assets.run_worker_first.filter((rule) => rule.startsWith('!/'))
      .map((rule) => rule.slice(2).replace(/\/\*$/, ''))
    const published = readdirSync('public', { withFileTypes: true })
    const folders = published
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)

    // Vite writes the built JavaScript and CSS to /assets, and scripts/automaticWebp.ts the converted pictures to /_webp.
    expect(new Set(skipped.filter((name) => !name.includes('.')))).toEqual(new Set([...folders, 'assets', '_webp']))
    for (const file of skipped.filter((name) => name.includes('.'))) {
      expect(published.some((entry) => entry.name === file), file).toBe(true)
    }
  })
})
