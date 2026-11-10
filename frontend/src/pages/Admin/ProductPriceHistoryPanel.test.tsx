import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as priceHistoryApi from '../../api/priceHistoryApi'
import { createTestQueryClient } from '../../test/test-utils'
import type { ProductPriceChange } from '../../types/priceHistory'
import { ProductPriceHistoryPanel } from './ProductPriceHistoryPanel'

vi.mock('../../api/priceHistoryApi', () => ({
  getAdminProductPriceHistory: vi.fn(),
}))

const productId = 'b3d66e20-e133-4506-a6c5-a47d2ee5cd00'

function change(overrides: Partial<ProductPriceChange>): ProductPriceChange {
  return {
    id: 'row-1',
    source: 'admin_edit',
    source_label: 'Admin edit',
    batch_id: '',
    currency: 'USD',
    old_price: '10.00',
    new_price: '12.00',
    old_discount_price: null,
    new_discount_price: '9.00',
    old_discount_ends_at: null,
    new_discount_ends_at: '2026-12-01T10:00:00Z',
    created_at: '2026-11-01T08:30:00Z',
    changed_by: { id: 'u1', full_name: 'Ada Admin', email: 'ada@example.com' },
    ...overrides,
  }
}

function renderPanel() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ProductPriceHistoryPanel productId={productId} />
    </QueryClientProvider>,
  )
}

describe('ProductPriceHistoryPanel', () => {
  beforeEach(() => {
    vi.mocked(priceHistoryApi.getAdminProductPriceHistory).mockReset()
  })

  it('is closed by default and does not fetch', () => {
    renderPanel()

    expect(screen.getByRole('button', { name: /price history/i })).toHaveAttribute('aria-expanded', 'false')
    expect(priceHistoryApi.getAdminProductPriceHistory).not.toHaveBeenCalled()
  })

  it('fetches when opened and renders the rows', async () => {
    vi.mocked(priceHistoryApi.getAdminProductPriceHistory).mockResolvedValue({
      results: [change({})],
    })
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /price history/i }))

    expect(await screen.findByText('Ada Admin')).toBeInTheDocument()
    expect(priceHistoryApi.getAdminProductPriceHistory).toHaveBeenCalledWith(productId)
    expect(screen.getByText('Admin edit')).toBeInTheDocument()
    expect(screen.getByText(/USD 10\.00 → USD 12\.00/)).toBeInTheDocument()
    expect(screen.getByText(/— → USD 9\.00/)).toBeInTheDocument()
  })

  it('shows System when nobody is attached to the change', async () => {
    vi.mocked(priceHistoryApi.getAdminProductPriceHistory).mockResolvedValue({
      results: [change({ source: 'sale_ended', source_label: 'Sale ended', changed_by: null })],
    })
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /price history/i }))

    expect(await screen.findByText('System')).toBeInTheDocument()
    expect(screen.getByText('Sale ended')).toBeInTheDocument()
  })

  it('shows an empty state', async () => {
    vi.mocked(priceHistoryApi.getAdminProductPriceHistory).mockResolvedValue({ results: [] })
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /price history/i }))

    expect(await screen.findByText('No price changes yet.')).toBeInTheDocument()
  })

  it('shows an error and retries', async () => {
    vi.mocked(priceHistoryApi.getAdminProductPriceHistory)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ results: [change({})] })
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /price history/i }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('Ada Admin')).toBeInTheDocument()
    await waitFor(() => expect(priceHistoryApi.getAdminProductPriceHistory).toHaveBeenCalledTimes(2))
  })
})
