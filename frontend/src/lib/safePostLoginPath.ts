/** Prevent open redirects to external URLs or protocol-relative paths. */
export function safePostLoginPath(fromPath: unknown): string | null {
  if (typeof fromPath !== 'string' || !fromPath.startsWith('/')) {
    return null
  }
  if (fromPath.startsWith('//') || fromPath.includes('\\')) {
    return null
  }

  try {
    const parsed = new URL(fromPath, 'https://example.invalid')
    if (parsed.username || parsed.password) {
      return null
    }
    // Keep query/hash so checkout return URLs like /checkout/success?order_id=… survive re-login.
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}

/** Build a safe return path from a React Router location-like `state.from` object. */
export function safeReturnLocation(
  from: { pathname?: string; search?: string; hash?: string } | null | undefined,
): string | null {
  if (!from?.pathname) {
    return null
  }
  return safePostLoginPath(`${from.pathname}${from.search ?? ''}${from.hash ?? ''}`)
}
