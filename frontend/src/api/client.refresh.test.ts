import axios from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { refreshSessionAccessToken } from './client'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('refreshSessionAccessToken', () => {
  it('collapses overlapping refresh calls into one cookie rotation', async () => {
    let release: (value: { data: { access: string } }) => void = () => {}
    const pending = new Promise<{ data: { access: string } }>((resolve) => {
      release = resolve
    })
    const post = vi.spyOn(axios, 'post').mockReturnValue(pending as never)

    const first = refreshSessionAccessToken()
    const second = refreshSessionAccessToken()
    release({ data: { access: 'rotated-access' } })

    await expect(first).resolves.toBe('rotated-access')
    await expect(second).resolves.toBe('rotated-access')
    expect(post).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenCalledWith(
      '/api/v1/auth/token/refresh/',
      {},
      expect.objectContaining({ withCredentials: true }),
    )
  })

  it('starts a new rotation after the previous one settles', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValueOnce({ data: { access: 'first' } } as never)
      .mockResolvedValueOnce({ data: { access: 'second' } } as never)

    await expect(refreshSessionAccessToken()).resolves.toBe('first')
    await expect(refreshSessionAccessToken()).resolves.toBe('second')
    expect(post).toHaveBeenCalledTimes(2)
  })
})
