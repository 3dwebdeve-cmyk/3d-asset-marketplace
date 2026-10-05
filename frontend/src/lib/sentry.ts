import * as Sentry from '@sentry/react'

type LogContext = Record<string, unknown>

const SENSITIVE_KEY_RE =
  /(password|token|secret|authorization|cookie|email|refresh|api[_-]?key)/i

function scrubValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/\/(reset-password|verify-email)\/[^/?#]+\/[^/?#]+/gi, '/$1/[Filtered]/[Filtered]')
      .replace(/([?&](?:token|access_token|refresh_token|password|secret|email|x-amz-[^=&#]+)=)[^&#\s]*/gi, '$1[Filtered]')
      .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [Filtered]')
      .replace(
        /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
        '[Filtered]',
      )
      .replace(
        /[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g,
        '[filtered-email]',
      )
  }
  if (Array.isArray(value)) {
    return value.map(scrubValue)
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_RE.test(key) ? '[Filtered]' : scrubValue(nested)
    }
    return out
  }
  return value
}

function scrubEventData<T>(data: T): T {
  return scrubValue(data) as T
}

export function initFrontendSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim()
  if (!dsn) {
    return
  }

  const tracesSampleRate = Number(
    import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ??
      (import.meta.env.PROD ? '0.1' : '0'),
  )

  Sentry.init({
    dsn,
    environment:
      import.meta.env.VITE_SENTRY_ENVIRONMENT?.trim() ||
      (import.meta.env.PROD ? 'production' : 'development'),
    sendDefaultPii: false,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : 0,
    integrations: [Sentry.browserTracingIntegration()],
    beforeSend(event) {
      if (event.user) {
        event.user = {
          id: event.user.id,
          // Never send email / IP / username from the SPA.
        }
      }
      if (event.request?.headers) {
        const headers = { ...event.request.headers }
        for (const key of Object.keys(headers)) {
          if (SENSITIVE_KEY_RE.test(key) || key.toLowerCase() === 'cookie') {
            headers[key] = '[Filtered]'
          }
        }
        event.request.headers = headers
      }
      if (event.extra) {
        event.extra = scrubEventData(event.extra)
      }
      if (typeof event.message === 'string') {
        event.message = scrubEventData(event.message)
      }
      return scrubEventData(event)
    },
    beforeSendTransaction(event) {
      return scrubEventData(event)
    },
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.data) {
        breadcrumb.data = scrubEventData(breadcrumb.data)
      }
      if (typeof breadcrumb.message === 'string') {
        breadcrumb.message = scrubEventData(breadcrumb.message)
      }
      return breadcrumb
    },
  })
}

export function reportClientError(
  message: string,
  context?: LogContext,
  level: 'error' | 'warning' = 'error',
): void {
  if (!import.meta.env.VITE_SENTRY_DSN?.trim()) {
    return
  }

  const scrubbed = context ? scrubEventData(context) : undefined
  Sentry.withScope((scope) => {
    if (scrubbed) {
      scope.setContext('logger', scrubbed)
    }
    scope.setLevel(level)
    const errorValue = scrubbed?.message
    if (typeof errorValue === 'string' && level === 'error') {
      Sentry.captureException(new Error(`${message}: ${errorValue}`))
      return
    }
    Sentry.captureMessage(message, level)
  })
}

export { Sentry, scrubEventData }
