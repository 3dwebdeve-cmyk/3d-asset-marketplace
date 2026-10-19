import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { submitContactForm } from '../../api/contactApi'
import { CustomProjectServices } from './CustomProjectServices'
// The services page is heavy to render; a loaded full-suite run can pass the 5 s default.
const SLOW_RENDER_TIMEOUT_MS = 20_000
vi.mock('../../api/contactApi', () => ({ submitContactForm: vi.fn() }))
beforeEach(() => { localStorage.clear(); vi.clearAllMocks() })
function renderServices() { render(<MemoryRouter><CustomProjectServices /></MemoryRouter>) }
it('opens the lifestyle brief from the card, saves a draft, and restores it', async () => {
  const user = userEvent.setup({ delay: null })
  renderServices()
  await user.click(screen.getByRole('checkbox', { name: /lifestyle & product renders/i }))
  expect(screen.getByRole('heading', { name: 'Add New Product Enquiry' })).toBeInTheDocument()
  await user.type(screen.getByLabelText(/project name/i), 'Summer launch')
  await user.click(screen.getByRole('button', { name: /save as a draft/i }))
  await user.click(screen.getByRole('button', { name: /back to services/i }))
  await user.click(screen.getByRole('button', { name: /next step/i }))
  expect(screen.getByLabelText(/project name/i)).toHaveValue('Summer launch')
  await user.click(screen.getByRole('button', { name: /reset data/i }))
  expect(screen.getByLabelText(/project name/i)).toHaveValue('')
}, SLOW_RENDER_TIMEOUT_MS)
it('reviews the brief and submits it through the existing contact API', async () => {
  vi.mocked(submitContactForm).mockResolvedValue({ detail: 'Received' })
  const user = userEvent.setup({ delay: null })
  renderServices()
  await user.click(screen.getByRole('checkbox', { name: /lifestyle & product renders/i }))
  await user.selectOptions(screen.getByLabelText(/product category/i), 'Furniture')
  await user.type(screen.getByLabelText(/what type of lifestyle scene/i), 'A sunny living room with a linen sofa.')
  await user.click(screen.getByRole('radio', { name: 'Photorealistic' }))
  await user.click(screen.getByRole('button', { name: /review enquiry/i }))
  expect(submitContactForm).not.toHaveBeenCalled()
  await user.type(screen.getByLabelText(/your name/i), 'Alex Smith')
  await user.type(screen.getByLabelText(/email address/i), 'alex@example.com')
  await user.click(screen.getByRole('checkbox', { name: /privacy policy/i }))
  await user.click(screen.getByRole('button', { name: /submit enquiry/i }))
  expect(await screen.findByRole('heading', { name: 'Enquiry received' })).toBeInTheDocument()
  expect(submitContactForm).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alex Smith', email: 'alex@example.com', message: expect.stringContaining('Style: Photorealistic') }))
}, SLOW_RENDER_TIMEOUT_MS)
