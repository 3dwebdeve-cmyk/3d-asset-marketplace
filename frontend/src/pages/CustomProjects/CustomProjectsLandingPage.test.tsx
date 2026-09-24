import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
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
