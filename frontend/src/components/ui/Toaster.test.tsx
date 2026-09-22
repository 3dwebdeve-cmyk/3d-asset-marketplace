import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toast } from '../../lib/toast'
import { useToastStore } from '../../store/toastStore'
import { resetToastStore } from '../../test/test-utils'
import { Toaster } from './Toaster'

beforeEach(() => {
  resetToastStore()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
})

describe('Toaster', () => {
  it('renders toast messages from the store', () => {
    toast.info('Profile saved')
    toast.error('Session expired')

    render(<Toaster />)

    expect(screen.getByText('Profile saved')).toBeInTheDocument()
    expect(screen.getByText('Session expired')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Profile saved')
    expect(screen.getByRole('alert')).toHaveTextContent('Session expired')
  })

  it('dismisses a toast when the close button is clicked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    toast.info('Signed out')

    render(<Toaster />)
    expect(screen.getByText('Signed out')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Dismiss notification' }))

    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    expect(screen.queryByText('Signed out')).not.toBeInTheDocument()
    expect(useToastStore.getState().toasts).toHaveLength(0)
  })

  it('auto-dismisses toasts after their duration', async () => {
    toast.info('Profile saved', { duration: 1000 })

    render(<Toaster />)
    expect(screen.getByText('Profile saved')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    await act(async () => {
      vi.advanceTimersByTime(200)
    })

    expect(screen.queryByText('Profile saved')).not.toBeInTheDocument()
  })
})
