import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Preloader, StartupPreloader } from './Preloader'

function mockMotionPreference(reduced = false) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  const preference = {
    matches: reduced,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener)
    }),
    removeEventListener: vi.fn((_event: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener)
    }),
  }
  vi.stubGlobal('matchMedia', () => preference)
  return {
    listeners,
    change(reduce: boolean) {
      preference.matches = reduce
      act(() => {
        listeners.forEach((listener) => listener({ matches: reduce } as MediaQueryListEvent))
      })
    },
  }
}

function advance(milliseconds: number) {
  act(() => { vi.advanceTimersByTime(milliseconds) })
}

beforeEach(() => {
  vi.useFakeTimers()
  mockMotionPreference()
})

afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('StartupPreloader', () => {
  it('plays the branded native animation before revealing a fast page with a brief fade', () => {
    const view = render(<StartupPreloader><button>Open catalog</button></StartupPreloader>)
    const animation = screen.getByTitle('AssetHive3D animation')
    const button = screen.getByRole('button', { name: 'Open catalog', hidden: true })

    expect(animation.tagName).toBe('IMG')
    expect(animation).toHaveAttribute('src', '/images/assethive-preloader.webp')
    expect(view.container.querySelector('iframe')).toBeNull()
    expect(screen.getByRole('status', { name: 'Loading AssetHive3D' })).toBeInTheDocument()
    expect(screen.getByRole('heading')).toHaveTextContent('AssetHive3D')
    expect(screen.getByText('Preparing your creative space')).toBeInTheDocument()
    expect(button.closest('[inert]')).not.toBeNull()
    expect(button.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Open catalog' })).not.toBeInTheDocument()

    advance(1000)
    fireEvent.load(animation)
    advance(1900)
    expect(animation).toBeInTheDocument()

    advance(150)
    expect(animation).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open catalog' })).toBe(button)
    expect(button.closest('[inert]')).toBeNull()
    advance(300)
    expect(animation).not.toBeInTheDocument()
  })

  it('preserves the same animation while legal, session and route loading phases change', () => {
    const view = render(
      <StartupPreloader><Preloader key="legal" label="Loading terms..." /></StartupPreloader>,
    )
    const animation = screen.getByTitle('AssetHive3D animation')
    fireEvent.load(animation)

    view.rerender(
      <StartupPreloader><Preloader key="session" label="Restoring your session..." /></StartupPreloader>,
    )
    advance(500)
    view.rerender(
      <StartupPreloader><Preloader key="route" label="Loading page..." /></StartupPreloader>,
    )

    expect(screen.getAllByTitle('AssetHive3D animation')).toEqual([animation])
    advance(1700)
    expect(animation).toBeInTheDocument()

    view.rerender(<StartupPreloader><main>Catalog ready</main></StartupPreloader>)
    expect(screen.getByRole('main')).toHaveTextContent('Catalog ready')
    advance(300)
    expect(animation).not.toBeInTheDocument()
  })

  it('waits for every pending loading boundary before revealing the page', () => {
    const view = render(
      <StartupPreloader>
        <Preloader key="first" label="First request" />
        <Preloader key="second" label="Second request" />
      </StartupPreloader>,
    )
    const animation = screen.getByTitle('AssetHive3D animation')
    fireEvent.load(animation)
    advance(2200)

    view.rerender(
      <StartupPreloader><Preloader key="second" label="Second request" /></StartupPreloader>,
    )
    expect(animation).toBeInTheDocument()

    view.rerender(<StartupPreloader><p>Requests complete</p></StartupPreloader>)
    expect(screen.getByText('Requests complete').closest('[inert]')).toBeNull()
    advance(300)
    expect(animation).not.toBeInTheDocument()
  })

  it('exposes ordinary loading UI at the deadline even if startup is still pending', () => {
    render(<StartupPreloader><Preloader label="Loading account..." /></StartupPreloader>)
    const animation = screen.getByTitle('AssetHive3D animation')
    fireEvent.load(animation)
    advance(5900)
    expect(animation).toBeInTheDocument()

    advance(200)
    expect(screen.getByText('Loading account...').closest('[inert]')).toBeNull()
    advance(300)
    expect(animation).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading account...')
  })

  it('releases a ready page if the image never loads and never restarts for later navigation', () => {
    const view = render(<StartupPreloader><button>Retry marketplace</button></StartupPreloader>)
    advance(6100)
    expect(screen.getByRole('button', { name: 'Retry marketplace' })).toBeInTheDocument()
    advance(300)
    expect(screen.queryByTitle('AssetHive3D animation')).not.toBeInTheDocument()

    view.rerender(
      <StartupPreloader><Preloader label="Loading next page..." /></StartupPreloader>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading next page...')
    expect(screen.queryByTitle('AssetHive3D animation')).not.toBeInTheDocument()
  })

  it('skips the playback delay when the image fails, while still waiting for startup to finish', () => {
    const view = render(<StartupPreloader><Preloader label="Loading terms..." /></StartupPreloader>)
    const animation = screen.getByTitle('AssetHive3D animation')
    fireEvent.error(animation)
    expect(animation).toBeInTheDocument()

    view.rerender(<StartupPreloader><button>Retry marketplace</button></StartupPreloader>)
    expect(screen.getByRole('button', { name: 'Retry marketplace' })).toBeInTheDocument()
    expect(animation).toBeInTheDocument()
    advance(300)
    expect(animation).not.toBeInTheDocument()
  })

  it('skips animation and delay when reduced motion is requested', () => {
    mockMotionPreference(true)
    render(<StartupPreloader><button>Browse models</button></StartupPreloader>)

    expect(screen.queryByTitle('AssetHive3D animation')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Browse models' }).closest('[inert]')).toBeNull()
  })

  it('dismisses immediately when reduced motion is enabled and does not restart when disabled', () => {
    const preference = mockMotionPreference()
    render(<StartupPreloader><button>Browse models</button></StartupPreloader>)
    expect(screen.getByTitle('AssetHive3D animation')).toBeInTheDocument()

    preference.change(true)
    expect(screen.queryByTitle('AssetHive3D animation')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Browse models' })).toBeInTheDocument()

    preference.change(false)
    expect(screen.queryByTitle('AssetHive3D animation')).not.toBeInTheDocument()
  })

  it('handles StrictMode effect replay and cleans up timers and motion listeners on unmount', () => {
    const preference = mockMotionPreference()
    const view = render(
      <StrictMode>
        <StartupPreloader><Preloader label="Loading startup..." /></StartupPreloader>
      </StrictMode>,
    )
    const animation = screen.getByTitle('AssetHive3D animation')
    fireEvent.load(animation)
    advance(2200)
    expect(animation).toBeInTheDocument()

    view.rerender(
      <StrictMode><StartupPreloader><p>Ready</p></StartupPreloader></StrictMode>,
    )
    expect(screen.getByText('Ready').closest('[inert]')).toBeNull()
    // Unmount during the fade to ensure the delayed removal is cancelled as well.
    expect(animation).toBeInTheDocument()
    view.unmount()

    expect(vi.getTimerCount()).toBe(0)
    expect(preference.listeners.size).toBe(0)
  })
})

it('uses the ordinary spinner when a loading fallback has no startup wrapper', () => {
  render(<Preloader label="Loading another page..." />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading another page...')
  expect(screen.queryByTitle('AssetHive3D animation')).not.toBeInTheDocument()
})
