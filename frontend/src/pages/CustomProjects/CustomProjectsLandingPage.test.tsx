import styles from './custom-studio.css?raw'
﻿import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { submitContactForm } from '../../api/contactApi'
import { CustomProjectsLandingPage } from './CustomProjectsLandingPage'

vi.mock('../../api/contactApi', () => ({ submitContactForm: vi.fn() }))
beforeEach(() => vi.clearAllMocks())

describe('CustomProjectsLandingPage', () => {
  it('keeps page styles compatible with the same-origin font security policy', () => {
    expect(styles).not.toMatch(/@import\s+(?:url\()?['"]?https?:/i)
    expect(styles).not.toContain('fonts.googleapis.com')
    expect(styles).not.toContain('fonts.gstatic.com')
  })

  it('renders the reference design and keeps page SEO', () => {
    render(<CustomProjectsLandingPage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('We’ll make it.')
    expect(screen.getByRole('list', { name: 'Enquiry progress' })).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(8)
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', `${window.location.origin}/custom-projects`)
  })

  it('requires a service and preserves details while moving back', async () => {
    const user = userEvent.setup()
    render(<CustomProjectsLandingPage />)
    await user.click(screen.getByRole('checkbox', { name: /^Product 3D modeling/i }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('status')).toHaveTextContent('Choose at least one service')
    await user.click(screen.getByRole('checkbox', { name: /Something else/i }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByRole('textbox', { name: /Scope of work/i }), 'Build a chair')
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByRole('checkbox', { name: /Something else/i })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('textbox', { name: /Scope of work/i })).toHaveValue('Build a chair')
  })

  it('sends all steps through the existing enquiry API', async () => {
    vi.mocked(submitContactForm).mockResolvedValue({ detail: 'Sent' })
    const user = userEvent.setup()
    render(<CustomProjectsLandingPage />)
    await user.click(screen.getByRole('checkbox', { name: /Something else/i }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByRole('textbox', { name: /Scope of work/i }), 'Build a chair')
    URL.createObjectURL = vi.fn(() => 'blob:reference')
    URL.revokeObjectURL = vi.fn()
    const image = new File(['reference'], 'chair.png', { type: 'image/png' })
    await user.upload(document.querySelector<HTMLInputElement>('[name=references]')!, image)
    await user.selectOptions(screen.getByRole('combobox', { name: /Delivery time/i }), 'Specific date')
    expect(screen.getByLabelText('Preferred delivery date')).toBeRequired()
    await user.selectOptions(screen.getByRole('combobox', { name: /Delivery time/i }), 'Flexible')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByRole('textbox', { name: 'Full name' }), 'Test Customer')
    await user.type(screen.getByRole('textbox', { name: 'Work email' }), 'customer@example.com')
    await user.click(screen.getByRole('checkbox', { name: /30% payment/i }))
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }))
    expect(submitContactForm).toHaveBeenCalledWith(expect.objectContaining({ name: 'Test Customer', email: 'customer@example.com', message: expect.stringContaining('Build a chair'), attachments: [image] }))
    expect(screen.getByRole('status')).toHaveTextContent('received for delivery')
    expect(screen.getByRole('button', { name: 'Enquiry sent' })).toBeDisabled()
  })
})


describe('enquiry completion', () => {
  async function submitFilledForm() {
    render(<CustomProjectsLandingPage />)
    const form = document.querySelector<HTMLFormElement>('#hive-enquiry')!
    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement
    fireEvent.submit(form)
    field('project').value = 'Build a chair'
    fireEvent.submit(form)
    field('contactName').value = 'Test Customer'
    field('contactEmail').value = 'customer@example.com'
    field('paymentAcknowledged').checked = true
    await act(async () => { fireEvent.submit(form) })
    return { form, field }
  }

  it('shows confirmation for three seconds then clears the form for a new enquiry', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(submitContactForm).mockResolvedValue({ detail: 'Received' })
      const { form, field } = await submitFilledForm()
      expect(screen.getByRole('button', { name: 'Enquiry sent' })).toBeDisabled()
      act(() => { vi.advanceTimersByTime(2999) })
      expect(screen.getByRole('button', { name: 'Enquiry sent' })).toBeInTheDocument()
      act(() => { vi.advanceTimersByTime(1) })
      expect(screen.getByRole('heading', { name: 'What do you need?' })).toHaveFocus()
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
      expect(screen.getAllByRole('checkbox').every(input => !(input as HTMLInputElement).checked)).toBe(true)
      expect(field('project').value).toBe('')
      expect(field('contactName').value).toBe('')
      expect(field('contactEmail').value).toBe('')
      expect(field('references').files).toHaveLength(0)
      expect(form.querySelector('.reference-previews')).toBeEmptyDOMElement()
      expect(form.querySelector('.brief-status')).toBeEmptyDOMElement()
      fireEvent.submit(form)
      expect(screen.getByRole('status')).toHaveTextContent('Choose at least one service')
    } finally { vi.useRealTimers() }
  })

  it('keeps customer details and permits retry when sending fails', async () => {
    vi.useFakeTimers()
    try {
      vi.mocked(submitContactForm).mockRejectedValue(new Error('Network unavailable'))
      const { field } = await submitFilledForm()
      act(() => { vi.advanceTimersByTime(3000) })
      expect(screen.getByRole('button', { name: 'Send enquiry' })).toBeEnabled()
      expect(field('contactName').value).toBe('Test Customer')
      expect(field('contactEmail').value).toBe('customer@example.com')
      expect(field('project').value).toBe('Build a chair')
    } finally { vi.useRealTimers() }
  })
})
