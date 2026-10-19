import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { saveEnquiryConfirmation } from '../../lib/projectEnquiryConfirmation'
import { ProjectEnquirySuccess } from './ProjectEnquirySuccess'

afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear() })
const details = {
  reference: 'REF-ENQ-123456ABCD', service: 'Product Images', project: 'Studio launch',
  name: 'Alex Smith', email: 'alex@example.com', message: 'Reference: REF-ENQ-123456ABCD\nService: Product Images\nProject brief: White studio images',
}

it('prints the reference and submitted project details using the browser PDF/print dialog', async () => {
  const print = vi.spyOn(window, 'print').mockImplementation(() => {})
  render(<MemoryRouter><ProjectEnquirySuccess confirmation={saveEnquiryConfirmation(details)} /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: 'Project Enquiry Confirmed!' })).toBeInTheDocument()
  expect(screen.getByText('REF-ENQ-123456ABCD', { selector: 'strong' })).toBeInTheDocument()
  expect(document.querySelector('.enquiry-print img')).toHaveAttribute('src', '/images/AssetHive%203D.svg')
  expect(document.querySelector('.enquiry-print pre')?.textContent).toBe(details.message)
  expect(document.querySelector('.enquiry-print')).toHaveTextContent('alex@example.com')
  await userEvent.click(screen.getByRole('button', { name: 'Print / Download Enquiry Details' }))
  expect(print).toHaveBeenCalledOnce()
})

it('still confirms the enquiry when session storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable') })
  const receipt = saveEnquiryConfirmation(details)
  expect(receipt.sessionSaved).toBe(false)
  render(<MemoryRouter><ProjectEnquirySuccess confirmation={receipt} /></MemoryRouter>)
  expect(screen.getByRole('heading', { name: 'Project Enquiry Confirmed!' })).toBeInTheDocument()
  expect(screen.getByText(/keep this reference code or print/i)).toBeInTheDocument()
})
