import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { REFUND_POLICY_VERSION } from '../../lib/legalDocuments'
import { TermsPage } from './LegalDocumentPage'
import { RefundPolicyPage } from './RefundPolicyPage'

describe('RefundPolicyPage', () => {
  it('renders the policy with its version, the 14-day window and SEO title', () => {
    render(
      <MemoryRouter>
        <RefundPolicyPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: /refund policy/i })).toBeInTheDocument()
    expect(screen.getByText(REFUND_POLICY_VERSION)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /when we give a refund/i })).toBeInTheDocument()
    expect(screen.getAllByText(/within 14 days of/i).length).toBeGreaterThan(0)
    expect(document.title).toMatch(/refund policy/i)
  })

  it('terms of service link to the refund policy', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Refund Policy' })).toHaveAttribute('href', '/refunds')
  })
})
