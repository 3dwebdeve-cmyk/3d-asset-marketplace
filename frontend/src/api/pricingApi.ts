import { apiClient } from './client'
import type {
  PackagePercents,
  PaginatedPricingRows,
  PricingApplyRequest,
  PricingApplyResult,
  PricingInputItem,
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

/** The default percent of the base price for each package. */
export async function getPricingDefaults(): Promise<PackagePercents> {
  const response = await apiClient.get<{ package_percents: PackagePercents }>(`${BASE}/defaults/`)
  return response.data.package_percents
}

export async function savePricingDefaults(percents: Partial<PackagePercents>): Promise<PackagePercents> {
  const response = await apiClient.put<{ package_percents: PackagePercents }>(`${BASE}/defaults/`, {
    package_percents: percents,
  })
  return response.data.package_percents
}

/** Save the models' hours, rate and own percents (before calculating the hours price). */
export async function savePricingInputs(
  items: PricingInputItem[],
): Promise<{ models: number; changed: number }> {
  const response = await apiClient.post<{ models: number; changed: number }>(`${BASE}/inputs/`, {
    items,
  })
  return response.data
}
