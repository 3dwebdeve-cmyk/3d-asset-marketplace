import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CUSTOM_PROJECT_SERVICES } from '../../lib/customProjectServices'
import { CustomProjectServices } from './CustomProjectServices'

function renderServices() {
  return render(
    <MemoryRouter>
      <CustomProjectServices />
    </MemoryRouter>,
  )
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('animation service card', () => {
  it('uses a short silent video loop instead of an animated GIF', () => {
    stubReducedMotion(false)
    const { container } = renderServices()
    const video = container.querySelector('video')!

    expect(video.getAttribute('src')).toMatch(/rolling-cubes\.mp4$/)
    expect(video.getAttribute('poster')).toMatch(/rolling-cubes-poster\.webp$/)
    expect(video.muted).toBe(true)
    expect(video.loop).toBe(true)
    expect(video.autoplay).toBe(true)
    expect(video.getAttribute('playsinline')).not.toBeNull()
    // Decorative: it must not add noise for screen readers or take keyboard focus.
    expect(video.getAttribute('aria-hidden')).toBe('true')
    expect(video.tabIndex).toBe(-1)
    expect(container.innerHTML).not.toMatch(/\.gif/)
  })

  it('does not start moving for visitors who ask for reduced motion', () => {
    stubReducedMotion(true)
    const { container } = renderServices()
    const video = container.querySelector('video')!

    expect(video.autoplay).toBe(false)
    expect(video.getAttribute('preload')).toBe('none')
    expect(video.getAttribute('poster')).toMatch(/\.webp$/)
  })

  it('points at files that exist in public/', () => {
    const files = Object.keys(import.meta.glob('../../../public/custome project image/*', { eager: false }))
    const animation = CUSTOM_PROJECT_SERVICES.find((s) => 'video' in s)!

    for (const url of [animation.image, (animation as { video: string }).video]) {
      expect(files).toContain(`../../../public${url}`)
    }
  })
})
