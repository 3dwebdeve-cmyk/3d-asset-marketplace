import { beforeEach, describe, expect, it } from 'vitest'

import { resetToastStore } from '../test/test-utils'
import { DEFAULT_TOAST_DURATION, useToastStore } from './toastStore'

beforeEach(() => {
  resetToastStore()
})

describe('useToastStore', () => {
  it('adds a success toast with the default duration', () => {
    const id = useToastStore.getState().addToast({
      variant: 'success',
      message: 'Signed in',
    })

    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]).toMatchObject({
      id,
      variant: 'success',
      message: 'Signed in',
      duration: DEFAULT_TOAST_DURATION,
    })
  })

  it('replaces an existing toast when the same id is reused', () => {
    useToastStore.getState().addToast({
      id: 'session-expired',
      variant: 'error',
      message: 'First message',
    })
    useToastStore.getState().addToast({
      id: 'session-expired',
      variant: 'error',
      message: 'Updated message',
    })

    const toasts = useToastStore.getState().toasts
    expect(toasts).toHaveLength(1)
    expect(toasts[0]?.message).toBe('Updated message')
  })

  it('dismisses a toast by id and can clear all toasts', () => {
    const firstId = useToastStore.getState().addToast({
      variant: 'info',
      message: 'One',
    })
    useToastStore.getState().addToast({
      variant: 'success',
      message: 'Two',
    })

    useToastStore.getState().dismissToast(firstId)
    expect(useToastStore.getState().toasts).toHaveLength(1)
    expect(useToastStore.getState().toasts[0]?.message).toBe('Two')

    useToastStore.getState().clearToasts()
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })
})
