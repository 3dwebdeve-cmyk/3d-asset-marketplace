import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { adminStepUp } from '../../api/authApi'
import { StepUpCancelledError, requestStepUp, useStepUpStore } from '../../store/stepUpStore'
import { createTestQueryClient } from '../../test/test-utils'
import { AdminStepUpDialog } from './AdminStepUpDialog'

vi.mock('../../api/authApi', () => ({ adminStepUp: vi.fn() }))

function setup() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <button type="button">Delete model</button>
      <AdminStepUpDialog />
    </QueryClientProvider>,
  )
}

function openPrompt(): Promise<void> {
  let pending: Promise<void> = Promise.resolve()
  act(() => {
    pending = requestStepUp()
  })
  // Cancelling rejects before the test awaits it; this marks it handled, and the test still
  // asserts the rejection itself.
  pending.catch(() => undefined)
  return pending
}

beforeEach(() => {
  vi.resetAllMocks()
  useStepUpStore.setState({ isOpen: false, hosts: 0, waiters: [] })
  vi.mocked(adminStepUp).mockResolvedValue({ step_up_until: '2026-11-23T10:05:00Z', expires_in: 300 })
})

afterEach(() => {
  useStepUpStore.setState({ isOpen: false, hosts: 0, waiters: [] })
})

describe('AdminStepUpDialog', () => {
  it('stays hidden until the server asks for a code', () => {
    setup()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('sends the authenticator code and lets the action continue', async () => {
    const user = userEvent.setup()
    setup()
    const pending = openPrompt()

    const dialog = await screen.findByRole('dialog', { name: "Confirm it's you" })
    expect(screen.getByLabelText('6-digit code')).toHaveFocus()
    await user.type(screen.getByLabelText('6-digit code'), '123456')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await expect(pending).resolves.toBeUndefined()
    expect(adminStepUp).toHaveBeenCalledWith({ code: '123456' })
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
  })

  it('can use a recovery code instead', async () => {
    const user = userEvent.setup()
    setup()
    const pending = openPrompt()

    await user.click(await screen.findByRole('button', { name: 'Use a recovery code instead' }))
    await user.type(screen.getByLabelText('Recovery code'), 'ABCDE-FGHIJ')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await expect(pending).resolves.toBeUndefined()
    expect(adminStepUp).toHaveBeenCalledWith({ recovery_code: 'ABCDE-FGHIJ' })
  })

  it('keeps the prompt open and shows why when the code is wrong', async () => {
    const user = userEvent.setup()
    vi.mocked(adminStepUp).mockRejectedValue(
      new AxiosError('Bad code', '400', undefined, undefined, {
        data: {
          detail: 'That code is not valid. Check the time on your phone and try again.',
          code: 'mfa_invalid',
        },
        status: 400,
        statusText: '',
        headers: {},
        config: {} as never,
      }),
    )
    setup()
    openPrompt()

    await user.type(await screen.findByLabelText('6-digit code'), '000000')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(
      await screen.findByText('That code is not valid. Check the time on your phone and try again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(useStepUpStore.getState().isOpen).toBe(true)
  })

  it('cancels with the Cancel button or Escape, and the action does not run', async () => {
    const user = userEvent.setup()
    setup()

    const first = openPrompt()
    await user.click(await screen.findByRole('button', { name: 'Cancel' }))
    await expect(first).rejects.toBeInstanceOf(StepUpCancelledError)

    const second = openPrompt()
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await expect(second).rejects.toBeInstanceOf(StepUpCancelledError)
    expect(adminStepUp).not.toHaveBeenCalled()
  })

  it('does not send an empty code', async () => {
    const user = userEvent.setup()
    setup()
    openPrompt()

    await user.click(await screen.findByRole('button', { name: 'Confirm' }))

    expect(adminStepUp).not.toHaveBeenCalled()
  })
})
