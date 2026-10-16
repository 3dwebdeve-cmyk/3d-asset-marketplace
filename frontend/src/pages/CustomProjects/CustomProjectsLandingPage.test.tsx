import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { useAuthStore } from '../../store/authStore'
import { useAuthUiStore } from '../../store/authUiStore'
import {
  createTestQueryClient,
  resetAuthStore,
  resetAuthUiStore,
} from '../../test/test-utils'
import { CustomProjectsLandingPage } from './CustomProjectsLandingPage'

function renderLanding() {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CustomProjectsLandingPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetAuthUiStore()
})

describe('CustomProjectsLandingPage', () => {
  it('hides How it works while the enquiry is open and restores it on return', async () => {
    const user = userEvent.setup()
    renderLanding()
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: /lifestyle & product renders/i }))
    expect(screen.queryByRole('heading', { name: 'How it works' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add New Product Enquiry' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /back to services/i }))
    expect(screen.getByRole('heading', { name: 'How it works' })).toBeInTheDocument()
  })

  it('carries selected services into the enquiry and requires a selection', async () => {
    const user = userEvent.setup()
    renderLanding()

    expect(screen.getAllByRole('checkbox')).toHaveLength(8)
    expect(screen.getAllByRole('checkbox').every((checkbox) => !(checkbox as HTMLInputElement).checked)).toBe(true)
    expect(screen.getByRole('button', { name: /next step/i })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /marketplace ready/i }))
    await user.click(screen.getByRole('checkbox', { name: /other \/ custom/i }))
    const nextUrl = new URL(screen.getByRole('link', { name: /next step/i }).getAttribute('href')!, 'https://example.com')
    expect(nextUrl.pathname).toBe('/contact')
    expect(nextUrl.searchParams.get('services')).toBe('Marketplace Ready Package, Other / Custom Service')
    expect(nextUrl.searchParams.get('enquiryType')).toBe('Custom 3D Modeling')
  })

  it('opens the 3D Modeling enquiry form when that service is selected', async () => {
    const user = userEvent.setup()
    renderLanding()

    await user.click(screen.getByRole('checkbox', { name: /^3d modeling/i }))
    expect(screen.getByRole('region', { name: '3D modeling enquiry' })).toBeInTheDocument()
  })

  it('opens the 3D Product Animation enquiry form when that service is selected', async () => {
    const user = userEvent.setup()
    renderLanding()

    await user.click(screen.getByRole('checkbox', { name: /3d product animation/i }))
    expect(screen.getByRole('region', { name: '3D product animation enquiry' })).toBeInTheDocument()
  })

  it('links guests and customers to the contact enquiry form', () => {
    renderLanding()

    const enquiryLinks = screen.getAllByRole('link', { name: /send a project enquiry/i })
    expect(enquiryLinks.length).toBeGreaterThanOrEqual(1)
    expect(enquiryLinks[0]).toHaveAttribute(
      'href',
      `/contact?enquiryType=${encodeURIComponent('Custom 3D Modeling')}`,
    )
    expect(screen.getByRole('link', { name: /^contact us$/i })).toHaveAttribute(
      'href',
      '/contact',
    )
  })

  it('does not open an auth gate for project requests', () => {
    renderLanding()

    expect(
      screen.queryByRole('button', { name: /sign in to request a project/i }),
    ).not.toBeInTheDocument()
    expect(useAuthUiStore.getState().isOpen).toBe(false)
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})
