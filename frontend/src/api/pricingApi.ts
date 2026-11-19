import { apiClient } from './client'
import type {
  PaginatedPricingRows,
  PricingListParams,
  PricingPublishResult,
  PricingTab,
} from '../types/pricing'

const BASE = '/api/v1/admin/products/pricing'

export async function listPricingModels(params: PricingListParams): Promise<PaginatedPricingRows> {
  const response = await apiClient.get<PaginatedPricingRows>(`${BASE}/`, { params })
  return response.data
}

export async function listPricingBatches(tab: PricingTab): Promise<string[]> {
  const response = await apiClient.get<{ results: string[] }>(`${BASE}/batches/`, {
    params: { tab },
  })
  return response.data.results
}

/** Put priced models from Waiting for price on the store. */
export async function publishPricing(
  productIds: string[],
  confirmCount: number,
): Promise<PricingPublishResult> {
  const response = await apiClient.post<PricingPublishResult>(`${BASE}/publish/`, {
    product_ids: productIds,
    confirm_count: confirmCount,
  })
  return response.data
}
