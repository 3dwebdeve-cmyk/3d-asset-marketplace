import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AboutPage } from './AboutPage'

describe('AboutPage', () => {
  it('renders the redesigned about sections and key CTAs', () => {
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', {
        name: /premium 3d assets and custom design, under one roof/i,
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /one place for everything 3d/i })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /empowering creators with quality and trust/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /what we offer/i })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /a clear and reliable process/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /let's create something great/i }),
    ).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /browse models/i })).toHaveAttribute(
      'href',
      '/3d-models',
    )
    expect(screen.getByRole('link', { name: /^custom projects$/i })).toHaveAttribute(
      'href',
      '/dashboard/projects/new',
    )
    expect(screen.getByRole('link', { name: /^contact$/i })).toHaveAttribute('href', '/contact')
  })
})
