import styles from './custom-studio.css?raw'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CustomProjectsLandingPage } from './CustomProjectsLandingPage'

describe('CustomProjectsLandingPage', () => {
  it('keeps fonts compatible with the security policy', () => {
    expect(styles).not.toContain('fonts.googleapis.com')
    expect(styles).not.toContain('fonts.gstatic.com')
  })
  it('replaces the enquiry panel with the four-step process and keeps SEO', () => {
    render(<CustomProjectsLandingPage />)
    expect(screen.getByRole('heading', { name: 'From brief to final files in four simple steps.' })).toBeInTheDocument()
    const steps = within(screen.getByRole('list', { name: 'Project process' })).getAllByRole('listitem')
    expect(steps).toHaveLength(4)
    expect(within(steps[0]).getByRole('heading')).toHaveTextContent('Send your enquiry')
    expect(within(steps[3]).getByRole('heading')).toHaveTextContent('Review and receive files')
    expect(screen.queryByRole('heading', { name: 'What do you need?' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Brief the Hive' })).toHaveAttribute('href', '/contact')
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', window.location.origin + '/custom-projects')
  })
})
