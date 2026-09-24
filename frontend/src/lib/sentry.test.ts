import { describe, expect, it } from 'vitest'

import { scrubEventData } from './sentry'

describe('scrubEventData', () => {
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
