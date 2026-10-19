import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { submitContactForm } from '../../api/contactApi'
import { ProductImagesEnquiryForm } from './ProductImagesEnquiryForm'
import { ModelingEnquiryForm } from './ModelingEnquiryForm'
import { PackagingEnquiryForm } from './PackagingEnquiryForm'
import { AnimationEnquiryForm } from './AnimationEnquiryForm'

vi.mock('../../api/contactApi', () => ({ submitContactForm: vi.fn() }))
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks() })

it.each([
  { service: 'Product Images', Component: ProductImagesEnquiryForm, draft: 'product-images-enquiry-draft', briefLabel: /creative direction & composition/i, briefKey: 'direction' },
  { service: '3D Modeling', Component: ModelingEnquiryForm, draft: 'modeling-enquiry-draft', briefLabel: /tell us about the 3d model/i, briefKey: 'brief' },
  { service: 'Packaging Design', Component: PackagingEnquiryForm, draft: 'packaging-enquiry-draft', briefLabel: /describe the packaging concept/i, briefKey: 'concept' },
  { service: '3D Product Animation', Component: AnimationEnquiryForm, draft: 'animation-enquiry-draft', briefLabel: /describe the animation you want/i, briefKey: 'brief' },
])('edits, saves and submits $service through the shared review design', async ({ service, Component, draft, briefLabel, briefKey }) => {
  localStorage.setItem(draft, JSON.stringify({ project: 'Original project', category: 'Furniture', brief: 'Original brief', direction: 'Original brief', concept: 'Original brief', types: 'White background' }))
  vi.mocked(submitContactForm).mockResolvedValue({ detail: 'Received' })
  const user = userEvent.setup()
  const { container } = render(<MemoryRouter><Component onBack={vi.fn()} /></MemoryRouter>)
  await user.click(screen.getByRole('button', { name: /review enquiry/i }))
  expect(screen.getByRole('heading', { name: 'Review & Edit Project Enquiry' })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Service category' })).toHaveValue(service)
  expect(screen.getByRole('button', { name: 'Print summary' })).toBeInTheDocument()
  expect(screen.queryByText('Review your project')).not.toBeInTheDocument()

  await user.clear(screen.getByLabelText(briefLabel))
  await user.type(screen.getByLabelText(briefLabel), 'Updated production brief')
  await user.type(screen.getByLabelText(/company \/ brand name/i), 'Studio North')
  await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(['reference'], 'reference.pdf', { type: 'application/pdf' }))
  expect(screen.getByRole('button', { name: 'Remove reference.pdf' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /save as a draft/i }))
  const saved = JSON.parse(localStorage.getItem(draft)!)
  expect(saved[briefKey]).toBe('Updated production brief')
  expect(saved.company).toBe('Studio North')

  await user.type(screen.getByLabelText(/your name/i), 'Alex Smith')
  await user.type(screen.getByLabelText(/email address/i), 'alex@example.com')
  await user.click(screen.getByRole('checkbox', { name: /privacy policy/i }))
  await user.click(screen.getByRole('button', { name: /confirm & send project enquiry/i }))
  expect(await screen.findByRole('heading', { name: 'Project Enquiry Confirmed!' })).toBeInTheDocument()
  expect(submitContactForm).toHaveBeenCalledWith(expect.objectContaining({
    name: 'Alex Smith', email: 'alex@example.com',
    message: expect.stringContaining('Updated production brief'),
  }))
  const message = vi.mocked(submitContactForm).mock.calls[0][0].message
  expect(message).toContain(`Service: ${service}`)
  expect(message).toContain('Company / brand: Studio North')
  expect(message).toContain('reference.pdf')
  const reference = message.match(/REF-ENQ-[A-F0-9]{10}/)?.[0]
  expect(reference).toBeDefined()
  expect(screen.getByText(reference!, { selector: 'strong' })).toBeInTheDocument()
  const receipt = JSON.parse(sessionStorage.getItem(`project-enquiry-confirmation:${reference}`)!)
  expect(receipt.message).toBe(message)
  expect(receipt.sessionSaved).toBe(true)
  expect(screen.getByRole('link', { name: 'Return to Marketplace Home' })).toHaveAttribute('href', '/')
  expect(localStorage.getItem(draft)).toBeNull()
})
