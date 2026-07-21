import { beforeEach, describe, expect, it } from 'vitest'

import { useToastStore } from '../store/toastStore'
import { resetToastStore } from '../test/test-utils'
import { toast } from './toast'

beforeEach(() => {
  resetToastStore()
})

describe('toast API', () => {
  it('creates success, error, and info toasts', () => {
    toast.success('Signed in')
    toast.error('Session expired')
    toast.info('Profile saved')

    const toasts = useToastStore.getState().toasts
    expect(toasts.map((item) => [item.variant, item.message])).toEqual([
      ['success', 'Signed in'],
      ['error', 'Session expired'],
      ['info', 'Profile saved'],
    ])
  })

  it('dismisses by id and clears the queue', () => {
    const id = toast.success('Signed in')
    toast.error('Keep me')

    toast.dismiss(id)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    expect(useToastStore.getState().toasts[0]?.message).toBe('Keep me')

    toast.clear()
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('supports sticky toasts with duration 0 and custom ids', () => {
    toast.error('Your session has expired. Please sign in again.', {
      id: 'session-expired',
      duration: 0,
    })

    const [item] = useToastStore.getState().toasts
    expect(item).toMatchObject({
      id: 'session-expired',
      duration: 0,
      variant: 'error',
    })
  })
})
