import { reportClientError } from './sentry'

type LogContext = Record<string, unknown>

function emit(level: 'error' | 'warn', message: string, context?: LogContext): void {
  if (import.meta.env.DEV) {
    const payload = context ? [message, context] : [message]
    console[level](...payload)
  }

  reportClientError(message, context, level === 'warn' ? 'warning' : 'error')
}

export const logger = {
  error(message: string, context?: LogContext): void {
    emit('error', message, context)
  },
  warn(message: string, context?: LogContext): void {
    emit('warn', message, context)
  },
}
