import { describe, expect, it } from 'vitest'

import { browserLabel } from './browserLabel'

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

describe('browserLabel', () => {
  it.each([
    [CHROME_WINDOWS, 'Chrome on Windows'],
    [`${CHROME_WINDOWS} Edg/131.0.0.0`, 'Edge on Windows'],
    [`${CHROME_WINDOWS} OPR/115.0.0.0`, 'Opera on Windows'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0', 'Firefox on Windows'],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      'Safari on Mac',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Safari on iPhone',
    ],
    [
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      'Chrome on Android',
    ],
  ])('names %s', (userAgent, label) => {
    expect(browserLabel(userAgent)).toBe(label)
  })

  it('falls back when the browser is unknown', () => {
    expect(browserLabel('')).toBe('Unknown browser')
    expect(browserLabel(null)).toBe('Unknown browser')
    expect(browserLabel('curl/8.4.0')).toBe('Unknown browser')
  })
})
