interface AssetsBinding {
  fetch(request: Request): Promise<Response>
}

export interface WorkerEnv {
  ASSETS: AssetsBinding
  BACKEND_ORIGIN?: string
}

// Same security headers nginx sends for the SPA (frontend/nginx.conf). The Worker
// serves static assets directly, so without these the Cloudflare deploy has no CSP.
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' https://accounts.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self' blob: https:; connect-src 'self' blob: https://accounts.google.com https://*.googleapis.com https://*.sentry.io https://*.ingest.sentry.io https://pub-a20fb6d206fc47a1b1e5e247e82838e0.r2.dev https://0d3f756f61c3239ec77f9941c82c20c3.r2.cloudflarestorage.com; worker-src 'self' blob:; frame-src https://accounts.google.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; report-uri /api/v1/security/csp-report/",
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const isApiPath = (pathname: string): boolean =>
  pathname === '/api' || pathname.startsWith('/api/')

function backendOrigin(value: string | undefined): URL {
  if (!value) {
    throw new Error('BACKEND_ORIGIN is not configured')
  }

  const url = new URL(value)
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('BACKEND_ORIGIN must be an HTTPS origin without a path')
  }

  return url
}

function errorResponse(status: number, detail: string): Response {
  return Response.json(
    { detail },
    {
      status,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}

export async function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const incomingUrl = new URL(request.url)
  if (!isApiPath(incomingUrl.pathname)) {
    return withSecurityHeaders(await env.ASSETS.fetch(request))
  }

  let origin: URL
  try {
    origin = backendOrigin(env.BACKEND_ORIGIN)
  } catch {
    return errorResponse(503, 'API proxy is not configured.')
  }

  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, origin)
  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.set('X-Forwarded-Host', incomingUrl.host)
  headers.set('X-Forwarded-Proto', 'https')

  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    redirect: 'manual',
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
    init.duplex = 'half'
  }

  try {
    return await fetch(new Request(upstreamUrl, init))
  } catch {
    return errorResponse(502, 'The API service is temporarily unavailable.')
  }
}

export default {
  fetch: handleRequest,
}
