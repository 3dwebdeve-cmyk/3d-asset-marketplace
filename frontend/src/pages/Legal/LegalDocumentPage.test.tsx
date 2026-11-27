import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { COOKIE_POLICY_VERSION, LEGAL_DOCUMENT_VERSIONS } from '../../lib/legalDocuments'
import { CookiePolicyPage, PrivacyPage, TermsPage } from './LegalDocumentPage'

describe('CookiePolicyPage', () => {
  it('renders the cookie list, its version, and a link back to privacy', () => {
    render(
      <MemoryRouter>
        <CookiePolicyPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1, name: /cookie policy/i })).toBeInTheDocument()
    expect(screen.getByText(COOKIE_POLICY_VERSION)).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'refresh_token' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveAttribute('href', '/privacy')
    expect(document.title).toMatch(/cookie policy/i)
  })

  it('privacy policy links to the cookie policy', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /^cookie policy$/i })).toHaveAttribute('href', '/cookies')
  })
})

describe('LegalDocumentPage', () => {
  it('renders terms with version and SEO title', () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: /terms of service/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(LEGAL_DOCUMENT_VERSIONS.terms)).toBeInTheDocument()
    expect(document.title).toMatch(/terms of service/i)
  })

  it('renders privacy with link to terms', () => {
    render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    )
    expect(
      screen.getByRole('heading', { level: 1, name: /privacy policy/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /terms of service/i })).toHaveAttribute(
      'href',
      '/terms',
    )
  })
})
