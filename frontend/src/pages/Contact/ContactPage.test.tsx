import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as contactApi from '../../api/contactApi'
import { createTestQueryClient, resetAuthStore } from '../../test/test-utils'
import { ContactPage } from './ContactPage'

vi.mock('../../api/contactApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/contactApi')>(
    '../../api/contactApi',
  )
  return {
    ...actual,
    submitContactForm: vi.fn(),
  }
})

function renderContactPage() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ContactPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  resetAuthStore()
})

describe('ContactPage', () => {
  it('renders the contact form', () => {
    renderContactPage()

    expect(screen.getByRole('heading', { name: /contact the studio/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^subject$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^message$/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument()
  })

  it('shows validation errors for empty submit', async () => {
    const user = userEvent.setup()
    renderContactPage()

    await user.click(screen.getByRole('button', { name: /send message/i }))

    expect(await screen.findByText(/name must be at least 2 characters/i)).toBeInTheDocument()
    expect(contactApi.submitContactForm).not.toHaveBeenCalled()
  })

  it('shows success state after a successful submission', async () => {
    const user = userEvent.setup()
    vi.mocked(contactApi.submitContactForm).mockResolvedValue({
      detail: "Message sent — we'll reply by email.",
    })

    renderContactPage()

    await user.type(screen.getByLabelText(/your name/i), 'Alex Creator')
    await user.type(screen.getByLabelText(/email address/i), 'alex@example.com')
    await user.type(screen.getByLabelText(/^subject$/i), 'Custom project question')
    await user.type(
      screen.getByLabelText(/^message$/i),
      'I would like to know more about timelines.',
    )
    await user.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => {
      expect(contactApi.submitContactForm).toHaveBeenCalled()
    })
    expect(
      await screen.findByText(/message sent — we'll reply by email/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /send message/i })).not.toBeInTheDocument()
  })
})
