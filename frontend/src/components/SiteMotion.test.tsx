import { cleanup, render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SiteMotion } from './SiteMotion'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setup(reduced = false) {
  const observe = vi.fn()
  const unobserve = vi.fn()
  const disconnect = vi.fn()
  let notify: IntersectionObserverCallback
  const observer = { observe, unobserve, disconnect }
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { notify = callback }
    observe = observe
    unobserve = unobserve
    disconnect = disconnect
  })
  const listeners: Array<() => void> = []
  const preference = {
    matches: reduced,
    addEventListener: vi.fn((_event: string, listener: () => void) => listeners.push(listener)),
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal('matchMedia', () => preference)
  const view = render(
    <MemoryRouter><SiteMotion /><div className="app-shell"><article className="product-card">Model</article></div></MemoryRouter>,
  )
  const card = view.container.querySelector('.product-card')!
  const cancel = vi.fn()
  const animate = vi.fn(() => ({ cancel, onfinish: null }))
  Object.defineProperty(card, 'animate', { configurable: true, value: animate })
  return {
    ...view, card, observe, unobserve, disconnect, animate, cancel, preference,
    intersect: () => notify([{ target: card, isIntersecting: true } as IntersectionObserverEntry], observer as unknown as IntersectionObserver),
    changePreference: () => listeners.forEach((listener) => listener()),
  }
}

describe('SiteMotion', () => {
  it('reveals a visible card and cancels active animation on unmount', () => {
    const view = setup()
    expect(view.observe).toHaveBeenCalledWith(view.card)
    view.intersect()
    expect(view.animate).toHaveBeenCalledOnce()
    expect(view.unobserve).toHaveBeenCalledWith(view.card)
    view.unmount()
    expect(view.disconnect).toHaveBeenCalled()
    expect(view.cancel).toHaveBeenCalledOnce()
  })

  it('registers asynchronously loaded cards but skips inert carousel copies', async () => {
    const view = setup()
    const fresh = document.createElement('article')
    fresh.className = 'product-card'
    const copy = fresh.cloneNode() as HTMLElement
    copy.setAttribute('inert', '')
    view.container.querySelector('.app-shell')!.append(fresh, copy)
    await waitFor(() => expect(view.observe).toHaveBeenCalledWith(fresh))
    expect(view.observe).not.toHaveBeenCalledWith(copy)
  })

  it('keeps all content visible without animation when reduced motion is enabled', () => {
    const view = setup(true)
    expect(view.observe).not.toHaveBeenCalled()
    expect(view.animate).not.toHaveBeenCalled()
    expect(view.card).toBeVisible()
  })

  it('cancels motion immediately when the preference changes', () => {
    const view = setup()
    view.intersect()
    view.preference.matches = true
    view.changePreference()
    expect(view.cancel).toHaveBeenCalledOnce()
    expect(view.disconnect).toHaveBeenCalled()
  })
})
