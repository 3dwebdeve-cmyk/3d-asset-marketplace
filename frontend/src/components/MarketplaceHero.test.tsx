import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { MarketplaceHero } from './MarketplaceHero'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-probe">{location.pathname + location.search}</div>
}

describe('MarketplaceHero', () => {
  it('zooms the image with scroll, reverses at the top, and respects reduced motion', () => {
    const preference = { matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('matchMedia', () => preference)
    vi.stubGlobal('scrollY', 0)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => (
      { top: 100 - window.scrollY, height: 500 } as DOMRect
    ))
    let frame: FrameRequestCallback = () => {}
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frame = callback
      return 1
    })
    const { container, unmount } = render(<MemoryRouter><MarketplaceHero /></MemoryRouter>)
    const stage = container.querySelector<HTMLElement>('.home-marketplace-hero__stage')!
    expect(stage.style.getPropertyValue('--hero-scroll-scale')).toBe('1')
    vi.stubGlobal('scrollY', 300)
    fireEvent.scroll(window)
    frame(16)
    expect(stage.style.getPropertyValue('--hero-scroll-scale')).toBe('1.03')
    vi.stubGlobal('scrollY', 0)
    fireEvent.scroll(window)
    frame(32)
    expect(stage.style.getPropertyValue('--hero-scroll-scale')).toBe('1')
    preference.matches = true
    vi.stubGlobal('scrollY', 300)
    fireEvent.scroll(window)
    frame(48)
    expect(stage.style.getPropertyValue('--hero-scroll-scale')).toBe('1')
    unmount()
    expect(stage.style.getPropertyValue('--hero-scroll-scale')).toBe('')
  })

  it('renders all trending tags and sort pills', () => {
    render(
      <MemoryRouter>
        <MarketplaceHero />
      </MemoryRouter>,
    )

    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent(/furniture & interior 3D models for visualization and design/i)
    // The headline must stay a claim the shop can prove.
    expect(heading).not.toHaveTextContent(/largest|best|#1/i)
    expect(screen.getByRole('button', { name: /^3D Models$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Furniture/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Interior/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Lighting/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Plants/i })).toBeInTheDocument()

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

    const furnitureButton = screen.getByRole('button', { name: /Furniture/i })
    await user.click(furnitureButton)
    expect(furnitureButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('location-probe').textContent).toBe('/3d-models?search=Furniture')

    const lightingButton = screen.getByRole('button', { name: /Lighting/i })
    await user.click(lightingButton)
    expect(lightingButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('location-probe').textContent).toBe('/3d-models?search=Lighting')
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

    expect(screen.getByRole('combobox', { name: /Search category/i })).toHaveValue('models')
    expect(screen.getByTestId('location-probe').textContent).toContain('/3d-models?search=spaceship')

    await user.selectOptions(screen.getByRole('combobox', { name: /Search category/i }), 'plugins')
    await user.clear(input)
    await user.type(input, 'robot{enter}')

    expect(screen.getByTestId('location-probe').textContent).toContain('/plugins?search=robot')
  })
})
