import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { MarketplaceHero } from './MarketplaceHero'

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{location.pathname + location.search}</div>
}

describe('MarketplaceHero', () => {
  it('renders all trending tags and sort pills', () => {
    render(
      <MemoryRouter>
        <MarketplaceHero />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: /World's largest 3D model marketplace/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /3D Models/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /3D character/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Game Environment/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Low Poly/i })).toBeInTheDocument()

    expect(screen.getByRole('button', { name: /Newest/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Top Selling/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Trending/i })).toBeInTheDocument()
  })

  it('navigates when clicking trending chips and updates active state', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/home']}>
        <MarketplaceHero />
        <LocationProbe />
      </MemoryRouter>,
    )

    const charButton = screen.getByRole('button', { name: /3D character/i })
    await user.click(charButton)
    expect(charButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('location-probe').textContent).toBe('/3d-models?search=3D+character')

    const lowPolyButton = screen.getByRole('button', { name: /Low Poly/i })
    await user.click(lowPolyButton)
    expect(lowPolyButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('location-probe').textContent).toBe('/3d-models?search=Low+Poly')
  })

  it('navigates when clicking sort pills and updates active state', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/home']}>
        <MarketplaceHero />
        <LocationProbe />
      </MemoryRouter>,
    )

    const topSellingButton = screen.getByRole('button', { name: /Top Selling/i })
    await user.click(topSellingButton)
    expect(topSellingButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('location-probe').textContent).toBe('/3d-models?ordering=-total_downloads')

    const newestButton = screen.getByRole('button', { name: /Newest/i })
    await user.click(newestButton)
    expect(newestButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('location-probe').textContent).toBe('/3d-models?ordering=-created_at')
  })

  it('navigates when submitting the search input', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/home']}>
        <MarketplaceHero />
        <LocationProbe />
      </MemoryRouter>,
    )

    const input = screen.getByRole('searchbox', { name: /Search marketplace/i })
    await user.type(input, 'spaceship{enter}')

    expect(screen.getByTestId('location-probe').textContent).toContain('/plugins?search=spaceship')

    await user.selectOptions(screen.getByRole('combobox', { name: /Search category/i }), 'models')
    await user.clear(input)
    await user.type(input, 'robot{enter}')

    expect(screen.getByTestId('location-probe').textContent).toContain('/3d-models?search=robot')
  })
})
