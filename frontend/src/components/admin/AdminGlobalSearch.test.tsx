import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchAdmin } from '../../api/adminSearchApi'
import { createTestQueryClient } from '../../test/test-utils'
import { AdminGlobalSearch } from './AdminGlobalSearch'

vi.mock('../../api/adminSearchApi', () => ({ searchAdmin: vi.fn() }))
const empty = { products: [], plugins: [], users: [], orders: [] }
const matches = {
  products: [{ id: 'model-1', label: 'Oak Chair', detail: 'MDL-000142' }],
  plugins: [{ id: 'plugin-1', label: 'Chair Tools', detail: 'published' }],
  users: [{ id: 'user-1', label: 'Chair Buyer', detail: 'buyer@example.com' }],
  orders: [{ id: 'order-1', label: 'INV-123', detail: 'buyer@example.com' }],
}
function setup() {
  render(<QueryClientProvider client={createTestQueryClient()}><MemoryRouter initialEntries={['/console']}>
    <Routes><Route path="/console" element={<AdminGlobalSearch />} />
      <Route path="/console/products/model-1" element={<p>Model details opened</p>} /></Routes>
  </MemoryRouter></QueryClientProvider>)
  return screen.getByRole('searchbox', { name: 'Search admin records' })
}
beforeEach(() => { vi.resetAllMocks(); vi.mocked(searchAdmin).mockResolvedValue(matches) })

describe('AdminGlobalSearch', () => {
  it('debounces search and opens a matching record with the keyboard', async () => {
    const user = userEvent.setup()
    const input = setup()
    await user.type(input, 'chair')
    expect(searchAdmin).not.toHaveBeenCalled()
    const model = await screen.findByRole('link', { name: /Oak Chair/ })
    expect(searchAdmin).toHaveBeenCalledWith('chair', expect.any(AbortSignal))
    for (const [label, path] of [['Chair Tools', 'plugins/plugin-1'], ['Chair Buyer', 'users/user-1'], ['INV-123', 'orders/order-1']]) {
      expect(screen.getByRole('link', { name: new RegExp(label) })).toHaveAttribute('href', `/console/${path}`)
    }
    await user.keyboard('{ArrowDown}')
    expect(model).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(await screen.findByText('Model details opened')).toBeInTheDocument()
  })

  it('supports Ctrl/Command K, Escape and outside clicks', async () => {
    const user = userEvent.setup()
    const input = setup()
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true })
    expect(input).toHaveFocus()
    expect(screen.getByText('Type at least 2 characters to search.')).toBeInTheDocument()
    await user.type(input, 'chair')
    await screen.findByRole('link', { name: /Oak Chair/ })
    await user.keyboard('{ArrowDown}{Escape}')
    expect(input).toHaveFocus()
    expect(screen.queryByRole('link', { name: /Oak Chair/ })).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'k', metaKey: true })
    await screen.findByRole('link', { name: /Oak Chair/ })
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('link', { name: /Oak Chair/ })).not.toBeInTheDocument()
  })

  it('shows empty results and hides previous matches while a new query waits', async () => {
    const user = userEvent.setup()
    const input = setup()
    await user.type(input, 'chair')
    await screen.findByRole('link', { name: /Oak Chair/ })
    vi.mocked(searchAdmin).mockResolvedValue(empty)
    await user.clear(input)
    await user.type(input, 'unknown')
    expect(screen.queryByRole('link', { name: /Oak Chair/ })).not.toBeInTheDocument()
    expect(await screen.findByText('No results found.')).toBeInTheDocument()
  })

  it('offers a working retry when a request fails', async () => {
    vi.mocked(searchAdmin).mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(matches)
    const user = userEvent.setup()
    await user.type(setup(), 'chair')
    await screen.findByText('Search could not load.')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByRole('link', { name: /Oak Chair/ })).toBeInTheDocument())
  })
})
