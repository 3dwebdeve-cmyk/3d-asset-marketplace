import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { NotFoundChromeProvider, useNotFoundChrome } from '../../hooks/useNotFoundChrome'
import { NotFoundPage } from './NotFoundPage'

function ChromeProbe() {
  const { isNotFound } = useNotFoundChrome()
  if (isNotFound) {
    return null
  }
  return <nav aria-label="Main">Site nav</nav>
}

function renderNotFound(initialEntry = '/missing-page') {
  return render(
    <NotFoundChromeProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ChromeProbe />
        <Routes>
          <Route path="/" element={<p>Marketplace home</p>} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>
    </NotFoundChromeProvider>,
  )
}

describe('NotFoundPage', () => {
  it('renders the 404 heading, copy, and homepage link', () => {
    renderNotFound()

    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    expect(screen.getByText(/you can search for the page you want here/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /homepage/i })).toHaveAttribute('href', '/')
    expect(document.title).toBe('404 - Page Not Found')
    expect(screen.queryByRole('navigation', { name: /main/i })).not.toBeInTheDocument()
  })

  it('shows the 404 page for undefined frontend routes', () => {
    renderNotFound('/this-route-does-not-exist')

    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument()
    expect(screen.queryByText('Marketplace home')).not.toBeInTheDocument()
  })

  it('navigates to the homepage when Escape is pressed', async () => {
    const user = userEvent.setup()
    renderNotFound()

    await user.keyboard('{Escape}')

    expect(await screen.findByText('Marketplace home')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /page not found/i })).not.toBeInTheDocument()
  })

  it('navigates to the homepage from the copy link', async () => {
    const user = userEvent.setup()
    renderNotFound()

    await user.click(screen.getByRole('link', { name: /homepage/i }))

    expect(await screen.findByText('Marketplace home')).toBeInTheDocument()
  })
})
