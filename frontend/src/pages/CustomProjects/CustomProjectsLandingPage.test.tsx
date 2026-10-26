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
  it('sets custom project search tags, a service preview image, and structured data for the visible services', () => {
    renderLanding()
    expect(document.title).toBe('Custom 3D Modeling, Rendering & Animation | AssetHive3D')
    expect(document.querySelector('meta[name="description"]')).toHaveAttribute('content', expect.stringContaining('packaging design and furniture visualization'))
    expect(document.querySelector('meta[name="keywords"]')).toHaveAttribute('content', expect.stringContaining('3D product animation'))
    expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', `${window.location.origin}/custom-projects`)
    expect(document.querySelector('meta[property="og:image"]')).toHaveAttribute('content', `${window.location.origin}/images/CUSTOM%20PROJECTS.webp`)
    expect(document.querySelector('meta[name="twitter:image:alt"]')).toHaveAttribute('content', 'Custom 3D project services from AssetHive3D')
    const data = JSON.parse(document.getElementById('seo-structured-data')!.textContent!)
    const service = data['@graph'].find((node: { '@type': string }) => node['@type'] === 'Service')
    expect(service.hasOfferCatalog.itemListElement).toHaveLength(8)
    for (const offer of service.hasOfferCatalog.itemListElement) {
      expect(screen.getByRole('checkbox', { name: new RegExp(offer.itemOffered.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) })).toBeInTheDocument()
      expect(offer).not.toHaveProperty('price')
    }
    expect(data['@graph'].some((node: { '@type': string }) => node['@type'] === 'BreadcrumbList')).toBe(true)
  })
  it('does not show the How it works section', () => {
    renderLanding()
    expect(screen.queryByRole('heading', { name: 'How it works' })).not.toBeInTheDocument()
  })

  it('requires a selection and opens the custom service form from its card and Next Step', async () => {
    const user = userEvent.setup()
    renderLanding()

    expect(screen.getAllByRole('checkbox')).toHaveLength(8)
    expect(screen.getAllByRole('checkbox').every((checkbox) => !(checkbox as HTMLInputElement).checked)).toBe(true)
    expect(screen.getByRole('button', { name: /next step/i })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /other \/ custom/i }))
    expect(screen.getByRole('region', { name: /other \/ custom service enquiry/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/service type/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /back to services/i }))
    expect(screen.getByRole('checkbox', { name: /other \/ custom/i })).toBeChecked()
    await user.click(screen.getByRole('button', { name: /next step/i }))
    expect(screen.getByRole('region', { name: /other \/ custom service enquiry/i })).toBeInTheDocument()
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

  it('opens the Furniture Visualization enquiry form when that service is selected', async () => {
    const user = userEvent.setup()
    renderLanding()
    await user.click(screen.getByRole('checkbox', { name: /furniture visualization/i }))
    expect(screen.getByRole('region', { name: /furniture visualization enquiry/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/furniture dimensions/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /review enquiry/i })).toBeInTheDocument()
  })

  it('opens the Marketplace Ready Package form from its card and Next Step', async () => {
    const user = userEvent.setup()
    renderLanding()
    await user.click(screen.getByRole('checkbox', { name: /marketplace ready/i }))
    expect(screen.getByRole('region', { name: /marketplace ready package enquiry/i })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /amazon marketplace/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /back to services/i }))
    await user.click(screen.getByRole('button', { name: /next step/i }))
    expect(screen.getByRole('region', { name: /marketplace ready package enquiry/i })).toBeInTheDocument()
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
