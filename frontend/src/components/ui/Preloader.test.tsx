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
  it('keeps a fast page mounted but inaccessible until the iframe has time to play', () => {
    render(<StartupPreloader><button>Open catalog</button></StartupPreloader>)
    const iframe = screen.getByTitle('Blue animated icon')
    const button = screen.getByRole('button', { name: 'Open catalog', hidden: true })

    expect(button.closest('[inert]')).not.toBeNull()
    expect(button.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Open catalog' })).not.toBeInTheDocument()

    advance(1000)
    fireEvent.load(iframe)
    advance(1900)
    expect(iframe).toBeInTheDocument()

    advance(150)
    expect(iframe).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open catalog' })).toBe(button)
    expect(button.closest('[inert]')).toBeNull()
  })

  it('preserves the same iframe while legal, session and route loading phases change', () => {
    const view = render(
      <StartupPreloader><Preloader key="legal" label="Loading terms..." /></StartupPreloader>,
    )
    const iframe = screen.getByTitle('Blue animated icon')
    fireEvent.load(iframe)

    view.rerender(
      <StartupPreloader><Preloader key="session" label="Restoring your session..." /></StartupPreloader>,
    )
    advance(500)
    view.rerender(
      <StartupPreloader><Preloader key="route" label="Loading page..." /></StartupPreloader>,
    )

    expect(screen.getAllByTitle('Blue animated icon')).toEqual([iframe])
    advance(1700)
    expect(iframe).toBeInTheDocument()

    view.rerender(<StartupPreloader><main>Catalog ready</main></StartupPreloader>)
    expect(iframe).not.toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveTextContent('Catalog ready')
  })

  it('waits for every pending loading boundary before revealing the page', () => {
    const view = render(
      <StartupPreloader>
        <Preloader key="first" label="First request" />
        <Preloader key="second" label="Second request" />
      </StartupPreloader>,
    )
    const iframe = screen.getByTitle('Blue animated icon')
    fireEvent.load(iframe)
    advance(2200)

    view.rerender(
      <StartupPreloader><Preloader key="second" label="Second request" /></StartupPreloader>,
    )
    expect(iframe).toBeInTheDocument()

    view.rerender(<StartupPreloader><p>Requests complete</p></StartupPreloader>)
    expect(iframe).not.toBeInTheDocument()
    expect(screen.getByText('Requests complete').closest('[inert]')).toBeNull()
  })

  it('exposes ordinary loading UI at the deadline even if startup is still pending', () => {
    render(<StartupPreloader><Preloader label="Loading account..." /></StartupPreloader>)
    const iframe = screen.getByTitle('Blue animated icon')
    fireEvent.load(iframe)
    advance(5900)
    expect(iframe).toBeInTheDocument()

    advance(200)
    expect(iframe).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading account...')
  })

  it('releases a ready page if the iframe never loads and never restarts for later navigation', () => {
    const view = render(<StartupPreloader><button>Retry marketplace</button></StartupPreloader>)
    advance(6100)
    expect(screen.queryByTitle('Blue animated icon')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry marketplace' })).toBeInTheDocument()

    view.rerender(
      <StartupPreloader><Preloader label="Loading next page..." /></StartupPreloader>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading next page...')
    expect(screen.queryByTitle('Blue animated icon')).not.toBeInTheDocument()
  })

  it('skips animation and delay when reduced motion is requested', () => {
    mockMotionPreference(true)
    render(<StartupPreloader><button>Browse models</button></StartupPreloader>)

    expect(screen.queryByTitle('Blue animated icon')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Browse models' }).closest('[inert]')).toBeNull()
  })

  it('dismisses immediately when reduced motion is enabled and does not restart when disabled', () => {
    const preference = mockMotionPreference()
    render(<StartupPreloader><button>Browse models</button></StartupPreloader>)
    expect(screen.getByTitle('Blue animated icon')).toBeInTheDocument()

    preference.change(true)
    expect(screen.queryByTitle('Blue animated icon')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Browse models' })).toBeInTheDocument()

    preference.change(false)
    expect(screen.queryByTitle('Blue animated icon')).not.toBeInTheDocument()
  })

  it('handles StrictMode effect replay and cleans up timers and motion listeners on unmount', () => {
    const preference = mockMotionPreference()
    const view = render(
      <StrictMode>
        <StartupPreloader><Preloader label="Loading startup..." /></StartupPreloader>
      </StrictMode>,
    )
    const iframe = screen.getByTitle('Blue animated icon')
    fireEvent.load(iframe)
    advance(2200)
    expect(iframe).toBeInTheDocument()

    view.rerender(
      <StrictMode><StartupPreloader><p>Ready</p></StartupPreloader></StrictMode>,
    )
    expect(iframe).not.toBeInTheDocument()
    view.unmount()

    expect(vi.getTimerCount()).toBe(0)
    expect(preference.listeners.size).toBe(0)
  })
})

it('uses the ordinary spinner when a loading fallback has no startup wrapper', () => {
  render(<Preloader label="Loading another page..." />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading another page...')
  expect(screen.queryByTitle('Blue animated icon')).not.toBeInTheDocument()
})
