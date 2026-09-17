import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from './client'
import {
  approveAdminProduct,
  listAdminProducts,
  rejectAdminProduct,
  requeueAdminProduct,
} from './productsApi'
import type { AdminProduct } from '../types/product'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const productId = 'b3d66e20-e133-4506-a6c5-a47d2ee5cd00'

const sampleProduct = {
  id: productId,
  status: 'published',
} as AdminProduct

beforeEach(() => {
  vi.clearAllMocks()
})

describe('productsApi QA helpers', () => {
  it('lists admin products with import_batch_id and status filters', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    })

    await listAdminProducts({
      status: 'pending_review',
      import_batch_id: '2026-09-03-run-01',
      page_size: 50,
    })

    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/admin/products/', {
      params: {
        status: 'pending_review',
        import_batch_id: '2026-09-03-run-01',
        page_size: 50,
      },
    })
  })

  it('approves an admin product', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({ data: sampleProduct })

    await approveAdminProduct(productId)

    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/v1/admin/products/${productId}/approve/`,
    )
  })

  it('rejects an admin product with reason and optional qa_notes', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { ...sampleProduct, status: 'rejected' },
    })

    await rejectAdminProduct(productId, {
      reason: 'Missing package',
      qa_notes: 'Need zip',
    })

    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/v1/admin/products/${productId}/reject/`,
      { reason: 'Missing package', qa_notes: 'Need zip' },
    )
  })

  it('requeues an admin product', async () => {
    vi.mocked(apiClient.post).mockResolvedValue({
      data: { ...sampleProduct, status: 'pending_review' },
    })

    await requeueAdminProduct(productId)

    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/v1/admin/products/${productId}/requeue/`,
    )
  })
})
