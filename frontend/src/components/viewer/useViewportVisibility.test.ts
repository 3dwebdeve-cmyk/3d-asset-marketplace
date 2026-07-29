import { act, createElement } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useViewportVisibility } from './useViewportVisibility'

describe('useViewportVisibility', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('updates visibility from IntersectionObserver callbacks', () => {
    let observerCallback: IntersectionObserverCallback = () => undefined

    class MockIntersectionObserver {
      constructor(callback: IntersectionObserverCallback) {
        observerCallback = callback
      }
      observe = vi.fn()
      disconnect = vi.fn()
    }

    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)

    function Probe() {
      const { ref, visible } = useViewportVisibility<HTMLDivElement>()
      return createElement('div', {
        ref,
        'data-testid': 'probe',
        'data-visible': visible ? 'true' : 'false',
      })
    }

    render(createElement(Probe))

    act(() => {
      observerCallback([{ isIntersecting: false } as IntersectionObserverEntry], {} as never)
    })

    expect(screen.getByTestId('probe')).toHaveAttribute('data-visible', 'false')

    act(() => {
      observerCallback([{ isIntersecting: true } as IntersectionObserverEntry], {} as never)
    })

    expect(screen.getByTestId('probe')).toHaveAttribute('data-visible', 'true')
  })
})
