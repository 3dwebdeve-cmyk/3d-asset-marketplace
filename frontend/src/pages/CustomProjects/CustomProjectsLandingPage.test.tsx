import styles from './custom-studio.css?raw'
﻿import { render, screen } from '@testing-library/react'
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
    await user.selectOptions(screen.getByRole('combobox', { name: /Delivery time/i }), 'Specific date')
    expect(screen.getByLabelText('Preferred delivery date')).toBeRequired()
    await user.selectOptions(screen.getByRole('combobox', { name: /Delivery time/i }), 'Flexible')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.type(screen.getByRole('textbox', { name: 'Full name' }), 'Test Customer')
    await user.type(screen.getByRole('textbox', { name: 'Work email' }), 'customer@example.com')
    await user.click(screen.getByRole('checkbox', { name: /30% payment/i }))
    await user.click(screen.getByRole('button', { name: 'Send enquiry' }))
    expect(submitContactForm).toHaveBeenCalledWith(expect.objectContaining({ name: 'Test Customer', email: 'customer@example.com', message: expect.stringContaining('Build a chair') }))
    expect(screen.getByRole('status')).toHaveTextContent('Your enquiry has been sent')
    expect(screen.getByRole('button', { name: 'Enquiry sent' })).toBeDisabled()
  })
})
