import { QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { createTestQueryClient } from '../../test/test-utils'

// Each test imports a fresh copy of the modules, so the forms start out not downloaded.
async function freshModules() {
  vi.resetModules()
  const [{ AuthModal }, { AuthEntryButton }, { useAuthUiStore }, panels] = await Promise.all([
    import('./AuthModal'),
    import('./AuthEntryButton'),
    import('../../store/authUiStore'),
    import('./loadAuthPanels'),
  ])
  return { AuthModal, AuthEntryButton, useAuthUiStore, panels }
}

describe('AuthModal before the forms are downloaded', () => {
  it('shows the form once it arrives and moves focus into the dialog', async () => {
    const { AuthModal, useAuthUiStore, panels } = await freshModules()
    expect(panels.loadedAuthPanels()).toBeNull()
    useAuthUiStore.getState().open({ mode: 'login' })

    await act(async () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter>
            <AuthModal />
          </MemoryRouter>
        </QueryClientProvider>,
      )
    })

    expect(await screen.findByRole('heading', { name: /welcome back/i }, { timeout: 10_000 })).toBeInTheDocument()
    const dialog = screen.getByRole('dialog')
    await vi.waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true), { timeout: 10_000 })
  })

  it('closes on Escape while the form is still downloading', async () => {
    const { AuthModal, useAuthUiStore } = await freshModules()
    useAuthUiStore.getState().open({ mode: 'login' })

    await act(async () => {
      render(
        <QueryClientProvider client={createTestQueryClient()}>
          <MemoryRouter>
            <AuthModal />
          </MemoryRouter>
        </QueryClientProvider>,
      )
    })
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(useAuthUiStore.getState().isOpen).toBe(false)
  })

  it('starts the download when the pointer reaches a Login button', async () => {
    const { AuthEntryButton, panels } = await freshModules()
    render(
      <MemoryRouter>
        <AuthEntryButton mode="login">Login</AuthEntryButton>
      </MemoryRouter>,
    )

    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Login' }))

    await vi.waitFor(() => expect(panels.loadedAuthPanels()).not.toBeNull(), { timeout: 10_000 })
  })
})
