import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { LEGAL_DOCUMENT_VERSIONS } from '../../lib/legalDocuments'
import { PrivacyPage, TermsPage } from './LegalDocumentPage'

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
