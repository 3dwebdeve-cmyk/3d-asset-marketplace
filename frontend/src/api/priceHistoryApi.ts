import { apiClient } from './client'
import type { ProductPriceHistory } from '../types/priceHistory'

export async function getAdminProductPriceHistory(productId: string): Promise<ProductPriceHistory> {
  const response = await apiClient.get<ProductPriceHistory>(
    `/api/v1/admin/products/${productId}/price-history/`,
  )
  return response.data
}
