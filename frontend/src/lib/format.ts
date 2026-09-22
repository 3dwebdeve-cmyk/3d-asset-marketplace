/** Shared display formatters for money, dates, and file sizes. */

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0 B'
  }
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Locale currency formatting for storefront and analytics.
 * Returns `fallback` (default `'—'`) when amount is null/empty.
 */
export function formatMoney(
  amount: string | null | undefined,
  currency: string,
  fallback = '—',
): string {
  if (amount == null || amount === '') {
    return fallback
  }
  const value = Number(amount)
  if (Number.isNaN(value)) {
    return `${currency} ${amount}`
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

/** Plain `USD 12.00` style used by admin/dashboard tables. */
export function formatMoneyPlain(
  amount: string | null | undefined,
  currency: string,
  fallback = '—',
): string {
  if (amount == null || amount === '') {
    return fallback
  }
  return `${currency} ${amount}`
}

/** Short calendar date (e.g. Mar 12, 2026). */
export function formatDate(value: string | null | undefined, invalidFallback = '—'): string {
  if (!value) {
    return invalidFallback
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return invalidFallback
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

/** Date + time for messages, deliveries, and download history. */
export function formatDateTime(value: string | null | undefined, invalidFallback = '—'): string {
  if (!value) {
    return invalidFallback
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return invalidFallback
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

/** Full locale string for admin tables (preserves prior toLocaleString behavior). */
export function formatLocaleDateTime(
  value: string | null | undefined,
  invalidFallback?: string,
): string {
  if (!value) {
    return invalidFallback ?? '—'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return invalidFallback ?? value
  }
  return date.toLocaleString()
}
