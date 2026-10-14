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

function renderContactPage(initialEntry = '/contact') {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
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
  it('renders the enquiry layout and form', () => {
    renderContactPage()

    expect(
      screen.getByRole('heading', {
        name: /enquire about 3d models, plugins or custom work/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /send us an enquiry/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/your name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/company \/ studio/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^phone/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/enquiry type/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^subject/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/your message/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send message/i })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /what can you enquire about/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/questions about our models, formats, licenses, or compatibility/i),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /frequently asked questions/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /view all/i })).not.toBeInTheDocument()
  })

  it('prefills email from the query string', () => {
    renderContactPage('/contact?email=alex%40example.com')

    expect(screen.getByLabelText(/email address/i)).toHaveValue('alex@example.com')
  })

  it('shows validation errors for empty submit', async () => {
    const user = userEvent.setup()
    renderContactPage()

    await user.click(screen.getByRole('button', { name: /send message/i }))

    expect(await screen.findByText(/name must be at least 2 characters/i)).toBeInTheDocument()
    expect(screen.getByText(/select an enquiry type/i)).toBeInTheDocument()
    expect(
      screen.getByText(/please agree to the privacy policy to continue/i),
    ).toBeInTheDocument()
    expect(contactApi.submitContactForm).not.toHaveBeenCalled()
  })

  it('shows success state after a successful submission', async () => {
    const user = userEvent.setup({ delay: null })
    vi.mocked(contactApi.submitContactForm).mockResolvedValue({
      detail: "Message sent — we'll reply by email.",
    })

    renderContactPage()

    await user.type(screen.getByLabelText(/your name/i), 'Alex Creator')
    await user.type(screen.getByLabelText(/company \/ studio/i), 'Studio North')
    await user.type(screen.getByLabelText(/email address/i), 'alex@example.com')
    await user.type(screen.getByLabelText(/^phone/i), '9876543210')
    await user.selectOptions(screen.getByLabelText(/enquiry type/i), 'Custom 3D Modeling')
    await user.type(screen.getByLabelText(/^subject/i), 'Custom project question')
    await user.type(
      screen.getByLabelText(/your message/i),
      'I would like to know more about timelines.',
    )
    await user.click(screen.getByRole('checkbox', { name: /privacy policy/i }))
    await user.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => {
      expect(contactApi.submitContactForm).toHaveBeenCalled()
    })

    const payload = vi.mocked(contactApi.submitContactForm).mock.calls[0]?.[0]
    expect(payload).toEqual(
      expect.objectContaining({
        name: 'Alex Creator',
        email: 'alex@example.com',
        subject: 'Custom project question',
      }),
    )
    expect(payload?.message).toContain('Enquiry type: Custom 3D Modeling')
    expect(payload?.message).toContain('Company / Studio: Studio North')
    expect(payload?.message).toContain('Phone: +91 9876543210')
    expect(
      await screen.findByText(/message sent — we'll reply by email/i),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /send message/i })).not.toBeInTheDocument()
  })

  it('toggles FAQ answers', async () => {
    const user = userEvent.setup()
    renderContactPage()

    expect(screen.queryByText(/we usually reply within 24 hours/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /can you create a custom 3d model/i }))

    expect(
      screen.getByText(/share your brief here or start a custom project request/i),
    ).toBeInTheDocument()
  })
})
