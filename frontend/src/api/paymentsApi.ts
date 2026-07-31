import { apiClient } from './client'
import type { CheckoutSessionResponse } from '../types/payment'

export async function createCheckoutSession(): Promise<CheckoutSessionResponse> {
  const { data } = await apiClient.post<CheckoutSessionResponse>('/api/payments/checkout/')
  return data
}
