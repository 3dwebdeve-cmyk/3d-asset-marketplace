interface AssetsBinding {
  fetch(request: Request): Promise<Response>
}

export interface WorkerEnv {
  ASSETS: AssetsBinding
  BACKEND_ORIGIN?: string
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
    return env.ASSETS.fetch(request)
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
