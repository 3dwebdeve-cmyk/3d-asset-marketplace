/** Prevent open redirects to external URLs or protocol-relative paths. */
export function safePostLoginPath(fromPathname: unknown): string | null {
  if (typeof fromPathname !== 'string' || !fromPathname.startsWith('/')) {
    return null
  }
  if (fromPathname.startsWith('//') || fromPathname.includes('\\')) {
    return null
  }
  return fromPathname
}
