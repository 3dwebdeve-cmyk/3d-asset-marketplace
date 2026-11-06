import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as downloadsApi from '../../api/downloadsApi'
import { createTestQueryClient } from '../../test/test-utils'
import { AdminDownloadsPage } from './AdminDownloadsPage'

vi.mock('../../api/downloadsApi', async () => ({
  ...await vi.importActual<typeof import('../../api/downloadsApi')>('../../api/downloadsApi'),
  listAdminDownloadHistory: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(downloadsApi.listAdminDownloadHistory).mockResolvedValue({
    count: 21, next: null, previous: null, results: [{
      id: 'download-1', user_email: 'customer@example.com', user_full_name: 'Customer',
      product_type: 'product', product_id: 'product-1', file_id: 'file-1', file_name: 'model.zip',
      invoice_number: 'INV-123', downloaded_at: '2026-10-30T10:00:00Z',
    }],
  })
})

function renderPage() {
  render(<QueryClientProvider client={createTestQueryClient()}><MemoryRouter><AdminDownloadsPage /></MemoryRouter></QueryClientProvider>)
}

describe('AdminDownloadsPage', () => {
  it('opens and closes details for a download record', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'View' }))
    expect(screen.getByRole('dialog', { name: 'Download details' })).toHaveTextContent('INV-123')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('paginates and resets the page when the type filter changes', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(downloadsApi.listAdminDownloadHistory).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, page_size: 10 })))
    await user.selectOptions(screen.getByLabelText('Filter by product type'), 'plugin')
    await waitFor(() => expect(downloadsApi.listAdminDownloadHistory).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, product_type: 'plugin' })))
  })
})
