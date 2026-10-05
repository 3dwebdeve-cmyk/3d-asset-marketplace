import { describe, expect, it } from 'vitest'

import { scrubEventData } from './sentry'

describe('scrubEventData', () => {
  it('redacts reset links and signed download URLs throughout telemetry', () => {
    const scrubbed = scrubEventData({
      transaction: '/reset-password/user/reset-secret',
      breadcrumbs: [{ url: 'https://cdn.test/file?X-Amz-Signature=signature-secret' }],
    })
    expect(JSON.stringify(scrubbed)).not.toContain('secret')
  })
  it('redacts tokens, passwords, and emails', () => {
    const scrubbed = scrubEventData({
      password: 'secret',
      access_token: 'abc',
      note: 'user jane@example.com used Bearer abc.def.ghi',
      nested: { refresh_token: 'xyz', ok: true },
    })

    expect(scrubbed).toEqual({
      password: '[Filtered]',
      access_token: '[Filtered]',
      note: 'user [filtered-email] used Bearer [Filtered]',
      nested: { refresh_token: '[Filtered]', ok: true },
    })
  })
})
