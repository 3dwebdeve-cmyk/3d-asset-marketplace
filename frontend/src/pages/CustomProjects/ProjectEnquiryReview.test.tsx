import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import { submitContactForm } from '../../api/contactApi'
import { ProductImagesEnquiryForm } from './ProductImagesEnquiryForm'
import { ModelingEnquiryForm } from './ModelingEnquiryForm'
import { PackagingEnquiryForm } from './PackagingEnquiryForm'
import { AnimationEnquiryForm } from './AnimationEnquiryForm'
import { FurnitureEnquiryForm } from './FurnitureEnquiryForm'
import { MarketplaceEnquiryForm } from './MarketplaceEnquiryForm'
import { CustomServiceEnquiryForm } from './CustomServiceEnquiryForm'

vi.mock('../../api/contactApi', () => ({ submitContactForm: vi.fn() }))
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); vi.clearAllMocks() })

it('prints the complete furniture brief, including details outside the review summary', async () => {
  localStorage.setItem('furniture-enquiry-draft', JSON.stringify({
    category: 'Furniture', brief: 'An oak dining set in a sunny room',
    dimensions: 'W: 85cm D: 90cm H: 75cm', material: 'Oak and linen',
    camera: 'Front and top-down', roomDimensions: '5m x 4m',
    renders: '6', formats: 'TIFF (Print)', name: 'Alex Smith', email: 'alex@example.com',
  }))
  const print = vi.spyOn(window, 'print').mockImplementation(() => {})
  const user = userEvent.setup()
  const { container } = render(<MemoryRouter><FurnitureEnquiryForm onBack={vi.fn()} /></MemoryRouter>)
  await user.click(screen.getByRole('button', { name: /review enquiry/i }))
  const details = container.querySelector('.furniture-enquiry__print-details')!
  for (const value of ['W: 85cm D: 90cm H: 75cm', 'Oak and linen', 'Front and top-down', '5m x 4m', 'TIFF (Print)', 'alex@example.com']) {
    expect(details.textContent).toContain(value)
  }
  await user.click(screen.getByRole('button', { name: 'Print summary' }))
  expect(print).toHaveBeenCalledOnce()
  print.mockRestore()
})

it('prints all marketplace details and selected reference file names', async () => {
  localStorage.setItem('marketplace-enquiry-draft', JSON.stringify({
    category: 'Electronics', brief: 'Launch a new insulated bottle',
    marketplace: 'US (Amazon.com)', outputs: 'A+ Content (EBC), Brand Story',
    benefits: 'Keeps drinks cold', audience: 'Daily commuters',
    dimensions: '2000 x 2000px', copy: 'Built for every journey',
    name: 'Alex Smith', email: 'alex@example.com',
  }))
  const print = vi.spyOn(window, 'print').mockImplementation(() => {})
  const user = userEvent.setup()
  const { container } = render(<MemoryRouter><MarketplaceEnquiryForm onBack={vi.fn()} /></MemoryRouter>)
  await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(['reference'], 'brand-guide.pdf', { type: 'application/pdf' }))
  await user.click(screen.getByRole('button', { name: /review enquiry/i }))
  const details = container.querySelector('.marketplace-enquiry__print-details')!
  for (const value of ['US (Amazon.com)', 'A+ Content (EBC), Brand Story', 'Keeps drinks cold', 'Daily commuters', '2000 x 2000px', 'Built for every journey', 'brand-guide.pdf', 'alex@example.com']) {
    expect(details.textContent).toContain(value)
  }
  await user.click(screen.getByRole('button', { name: 'Print summary' }))
  expect(print).toHaveBeenCalledOnce()
  print.mockRestore()
})

it('prints the full custom service specifications and selected file names', async () => {
  localStorage.setItem('custom-service-enquiry-draft', JSON.stringify({
    category: 'Interactive demo', brief: 'A real-time product configurator',
    purpose: 'Website', usage: 'Web / E-commerce', assets: '3',
    technical: '50k polygons, PBR textures', compatibility: 'Unreal Engine 5.3',
    deliverables: 'Editable scene and textures', additional: 'Include setup notes',
    name: 'Alex Smith', email: 'alex@example.com',
  }))
  const print = vi.spyOn(window, 'print').mockImplementation(() => {})
  const user = userEvent.setup()
  const { container } = render(<MemoryRouter><CustomServiceEnquiryForm onBack={vi.fn()} /></MemoryRouter>)
  await user.upload(container.querySelector<HTMLInputElement>('input[type="file"]')!, new File(['reference'], 'concept.psd', { type: 'image/vnd.adobe.photoshop' }))
  await user.click(screen.getByRole('button', { name: /review enquiry/i }))
  const details = container.querySelector('.custom-service-enquiry__print-details')!
  for (const value of ['Interactive demo', 'Web / E-commerce', 'Number of assets: 3', '50k polygons, PBR textures', 'Unreal Engine 5.3', 'Editable scene and textures', 'Include setup notes', 'concept.psd', 'alex@example.com']) {
    expect(details.textContent).toContain(value)
  }
  await user.click(screen.getByRole('button', { name: 'Print summary' }))
  expect(print).toHaveBeenCalledOnce()
  print.mockRestore()
})

it.each([
  { service: 'Product Images', Component: ProductImagesEnquiryForm, draft: 'product-images-enquiry-draft', briefLabel: /creative direction & composition/i, briefKey: 'direction' },
  { service: '3D Modeling', Component: ModelingEnquiryForm, draft: 'modeling-enquiry-draft', briefLabel: /tell us about the 3d model/i, briefKey: 'brief' },
  { service: 'Packaging Design', Component: PackagingEnquiryForm, draft: 'packaging-enquiry-draft', briefLabel: /describe the packaging concept/i, briefKey: 'concept' },
  { service: '3D Product Animation', Component: AnimationEnquiryForm, draft: 'animation-enquiry-draft', briefLabel: /describe the animation you want/i, briefKey: 'brief' },
  { service: 'Furniture Visualization', Component: FurnitureEnquiryForm, draft: 'furniture-enquiry-draft', briefLabel: /describe the furniture visualization/i, briefKey: 'brief' },
  { service: 'Marketplace Ready Package', Component: MarketplaceEnquiryForm, draft: 'marketplace-enquiry-draft', briefLabel: /tell us about your product & amazon listing requirements/i, briefKey: 'brief' },
  { service: 'Other / Custom Service', Component: CustomServiceEnquiryForm, draft: 'custom-service-enquiry-draft', briefLabel: /tell us what you need/i, briefKey: 'brief' },
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
