/** A short, readable name for a browser's user agent, e.g. "Chrome on Windows". */

// Checked in order: Edge, Opera and Samsung Internet also say "Chrome", and Chrome says "Safari".
const BROWSERS: ReadonlyArray<[string, RegExp]> = [
  ['Edge', /\b(Edg|Edge|EdgA|EdgiOS)\//],
  ['Opera', /\b(OPR|Opera)\b/],
  ['Samsung Internet', /\bSamsungBrowser\//],
  ['Firefox', /\b(Firefox|FxiOS)\//],
  ['Chrome', /\b(Chrome|CriOS|Chromium)\//],
  ['Safari', /\bSafari\//],
]

// iPhone and iPad before Mac (their user agent says "like Mac OS X"), Android before Linux.
const SYSTEMS: ReadonlyArray<[string, RegExp]> = [
  ['iPhone', /\biPhone\b/],
  ['iPad', /\biPad\b/],
  ['Android', /\bAndroid\b/],
  ['Windows', /\bWindows\b/],
  ['Mac', /\bMac OS X\b|\bMacintosh\b/],
  ['ChromeOS', /\bCrOS\b/],
  ['Linux', /\bLinux\b/],
]

function firstMatch(userAgent: string, table: ReadonlyArray<[string, RegExp]>): string | null {
  return table.find(([, pattern]) => pattern.test(userAgent))?.[0] ?? null
}

export function browserLabel(userAgent: string | null | undefined): string {
  const value = (userAgent ?? '').trim()
  if (!value) {
    return 'Unknown browser'
  }
  const browser = firstMatch(value, BROWSERS)
  const system = firstMatch(value, SYSTEMS)
  if (browser && system) {
    return `${browser} on ${system}`
  }
  return browser ?? system ?? 'Unknown browser'
}
