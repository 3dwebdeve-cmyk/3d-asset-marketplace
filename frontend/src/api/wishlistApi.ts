import type {
  PaginatedWishlistItems,
  WishlistAddPayload,
  WishlistItem,
  WishlistListParams,
} from '../types/wishlist'
import { apiClient } from './client'

function toWishlistQuery(params: WishlistListParams = {}): string {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.page_size) query.set('page_size', String(params.page_size))
  if (params.product_type) query.set('product_type', params.product_type)
  if (params.ordering) query.set('ordering', params.ordering)
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export async function listWishlistItems(
  params: WishlistListParams = {},
): Promise<PaginatedWishlistItems> {
  const { data } = await apiClient.get<PaginatedWishlistItems>(
    `/api/v1/wishlist/${toWishlistQuery(params)}`,
  )
  return data
}

export async function addWishlistItem(payload: WishlistAddPayload): Promise<WishlistItem> {
  const { data } = await apiClient.post<WishlistItem>('/api/v1/wishlist/', payload)
  return data
}

export async function removeWishlistItem(itemId: string): Promise<void> {
  await apiClient.delete(`/api/v1/wishlist/${itemId}/`)
}
