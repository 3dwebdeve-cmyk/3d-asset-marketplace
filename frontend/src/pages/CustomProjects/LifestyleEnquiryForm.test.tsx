import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { submitContactForm } from '../../api/contactApi'
import { CustomProjectServices } from './CustomProjectServices'
vi.mock('../../api/contactApi', () => ({ submitContactForm: vi.fn() }))
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks() })
function renderServices() { render(<MemoryRouter><CustomProjectServices /></MemoryRouter>) }
it('opens the lifestyle brief from the card, saves a draft, and restores it', async () => {
  const user = userEvent.setup()
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
})
it('reviews the brief and submits it through the existing contact API', async () => {
  vi.mocked(submitContactForm).mockResolvedValue({ detail: 'Received' })
  const user = userEvent.setup()
  renderServices()
  await user.click(screen.getByRole('checkbox', { name: /lifestyle & product renders/i }))
  await user.selectOptions(screen.getByLabelText(/product category/i), 'Furniture')
  await user.type(screen.getByLabelText(/what type of lifestyle scene/i), 'A sunny living room with a linen sofa.')
  await user.click(screen.getByRole('radio', { name: 'Photorealistic' }))
  await user.click(screen.getByRole('button', { name: /review enquiry/i }))
  expect(submitContactForm).not.toHaveBeenCalled()
  expect(screen.getByRole('heading', { name: 'Review & Edit Project Enquiry' })).toBeInTheDocument()
  await user.clear(screen.getByLabelText(/creative direction & project description/i))
  await user.type(screen.getByLabelText(/creative direction & project description/i), 'An edited sunny living room scene.')
  await user.type(screen.getByLabelText(/company \/ brand name/i), 'Studio North')
  await user.type(screen.getByLabelText(/your name/i), 'Alex Smith')
  await user.type(screen.getByLabelText(/email address/i), 'alex@example.com')
  await user.click(screen.getByRole('checkbox', { name: /privacy policy/i }))
  await user.click(screen.getByRole('button', { name: /confirm & send project enquiry/i }))
  expect(await screen.findByRole('heading', { name: 'Project Enquiry Confirmed!' })).toBeInTheDocument()
  expect(submitContactForm).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alex Smith', email: 'alex@example.com', message: expect.stringContaining('An edited sunny living room scene.') }))
})

it('removes reference files from the editable review and saves the updated brief as a draft', async () => {
  const user = userEvent.setup()
  renderServices()
  await user.click(screen.getByRole('checkbox', { name: /lifestyle & product renders/i }))
  await user.selectOptions(screen.getByLabelText(/product category/i), 'Furniture')
  await user.type(screen.getByLabelText(/what type of lifestyle scene/i), 'A sofa in a studio')
  await user.click(screen.getByRole('button', { name: /review enquiry/i }))
  await user.upload(screen.getByLabelText('Choose reference files'), new File(['reference'], 'reference.png', { type: 'image/png' }))
  expect(screen.getByRole('button', { name: 'Remove reference.png' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Remove reference.png' }))
  expect(screen.queryByText('reference.png')).not.toBeInTheDocument()
  await user.type(screen.getByLabelText(/project name/i), 'Studio sofa')
  await user.click(screen.getByRole('button', { name: /save as a draft/i }))
  expect(JSON.parse(localStorage.getItem('lifestyle-product-enquiry-draft')!).project).toBe('Studio sofa')
})
