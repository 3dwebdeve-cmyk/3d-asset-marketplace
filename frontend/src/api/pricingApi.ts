import { apiClient } from './client'
import type {
  PaginatedPricingRows,
  PricingApplyRequest,
  PricingApplyResult,
  PricingListParams,
  PricingPreview,
  PricingPublishResult,
  PricingRuleRequest,
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

/** The server calculates every price; nothing changes until applyPricing. */
export async function previewPricing(body: PricingRuleRequest): Promise<PricingPreview> {
  const response = await apiClient.post<PricingPreview>(`${BASE}/preview/`, body)
  return response.data
}

/** Step 1: save the previewed prices. 409 means something changed since the preview. */
export async function applyPricing(body: PricingApplyRequest): Promise<PricingApplyResult> {
  const response = await apiClient.post<PricingApplyResult>(`${BASE}/apply/`, body)
  return response.data
}

/** Step 2: put priced models from Waiting for price on the store. */
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
