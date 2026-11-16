import styles from './custom-studio.css?raw'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { fireEvent } from '@testing-library/react'
import { CustomProjectsLandingPage } from './CustomProjectsLandingPage'

describe('CustomProjectsLandingPage', () => {
  it('keeps fonts compatible with the security policy', () => {
    expect(styles).not.toContain('fonts.googleapis.com')
    expect(styles).not.toContain('fonts.gstatic.com')
  })
  it('shows the service selector after the process and carries selections into the enquiry', () => {
    render(<CustomProjectsLandingPage />)
    expect(screen.getByRole('heading', { name: 'From brief to final files in four simple steps.' })).toBeInTheDocument()
    const steps = within(screen.getByRole('list', { name: 'Project process' })).getAllByRole('listitem')
    expect(steps).toHaveLength(4)
    expect(within(steps[0]).getByRole('heading')).toHaveTextContent('Send your enquiry')
    expect(within(steps[3]).getByRole('heading')).toHaveTextContent('Review and receive files')
    expect(screen.getByRole('heading', { name: 'What do you need?' })).toBeInTheDocument()
    expect(screen.getAllByRole('checkbox')).toHaveLength(8)
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /Product 3D modeling/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Packaging design/ }))
    expect(screen.getByRole('status')).toHaveTextContent('2 services selected')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('heading', { name: 'Describe your project' })).toBeInTheDocument()
    expect(screen.getByText('Project details').closest('li')).toHaveAttribute('aria-current', 'step')
    const scope = screen.getByRole('textbox', { name: /Scope of work/ })
    fireEvent.change(scope, { target: { value: 'Create three product models' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Marketing renders' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit selection' }))
    expect(screen.getByRole('checkbox', { name: /Product 3D modeling/ })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByRole('textbox', { name: /Scope of work/ })).toHaveValue('Create three product models')
    expect(screen.getByRole('checkbox', { name: 'Marketing renders' })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Continue →' }))
    expect(screen.getByRole('heading', { name: 'Your contact details' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Have a brief? Send it today.' })).not.toBeInTheDocument()
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', window.location.origin + '/custom-projects')
  })
})
