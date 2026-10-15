import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, Link } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ScrollToTop } from './ScrollToTop'

function renderRoutes(initialPath = '/about') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ScrollToTop />
      <Routes>
        <Route
          path="/about"
          element={
            <main>
              <h1>About</h1>
              <Link to="/contact">Contact</Link>
            </main>
          }
        />
        <Route path="/contact" element={<h1>Contact</h1>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ScrollToTop', () => {
  beforeEach(() => {
    window.history.scrollRestoration = 'auto'
  })

  it('scrolls to the top and drops focus when the route changes', async () => {
    const user = userEvent.setup()
    const scrollTo = vi.fn()
    Object.defineProperty(window, 'scrollTo', {
      configurable: true,
      writable: true,
      value: scrollTo,
    })

    renderRoutes()
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' })

    const contact = screen.getByRole('link', { name: /contact/i })
    contact.focus()
    await user.click(contact)

    expect(screen.getByRole('heading', { name: /contact/i })).toBeInTheDocument()
    expect(document.activeElement).toBe(document.body)
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: 'instant' })
    expect(window.history.scrollRestoration).toBe('manual')
  })
})
