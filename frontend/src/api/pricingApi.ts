import { apiClient } from './client'
import type {
  PaginatedPricingRows,
  PricingCalculation,
  PricingInputBody,
  PricingListParams,
  PricingPublishRequest,
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

/** The prices the selection would get. The server calculates; nothing is saved. */
export async function calculatePricing(body: PricingInputBody): Promise<PricingCalculation> {
  const response = await apiClient.post<PricingCalculation>(`${BASE}/calculate/`, body)
  return response.data
}

/** Save the calculated prices and put the models on the store. 409: calculate again. */
export async function publishPricing(body: PricingPublishRequest): Promise<PricingPublishResult> {
  const response = await apiClient.post<PricingPublishResult>(`${BASE}/publish/`, body)
  return response.data
}

/** Set (or clear, with null) the hours spent of some models. */
export async function savePricingHours(
  items: { id: string; hours_spent: string | null }[],
): Promise<{ models: number; changed: number }> {
  const response = await apiClient.post<{ models: number; changed: number }>(`${BASE}/hours/`, {
    items,
  })
  return response.data
}
