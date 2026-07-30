import type {
  Cart,
  CartAddPayload,
  CartApplyCouponPayload,
  CartItem,
  CartUpdateQuantityPayload,
} from '../types/cart'
import { apiClient } from './client'

export async function getCart(): Promise<Cart> {
  const { data } = await apiClient.get<Cart>('/api/cart/')
  return data
}

export async function addCartItem(payload: CartAddPayload): Promise<CartItem> {
  const { data } = await apiClient.post<CartItem>('/api/cart/', payload)
  return data
}

export async function updateCartItemQuantity(
  itemId: string,
  payload: CartUpdateQuantityPayload,
): Promise<CartItem> {
  const { data } = await apiClient.patch<CartItem>(`/api/cart/items/${itemId}/`, payload)
  return data
}

export async function removeCartItem(itemId: string): Promise<void> {
  await apiClient.delete(`/api/cart/items/${itemId}/`)
}

export async function clearCart(): Promise<void> {
  await apiClient.delete('/api/cart/')
}

export async function applyCartCoupon(payload: CartApplyCouponPayload): Promise<Cart> {
  const { data } = await apiClient.post<Cart>('/api/cart/coupon/', payload)
  return data
}

export async function removeCartCoupon(): Promise<Cart> {
  const { data } = await apiClient.delete<Cart>('/api/cart/coupon/')
  return data
}
