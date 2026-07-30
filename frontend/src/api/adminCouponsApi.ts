import { apiClient } from './client'
import type {
  AdminCoupon,
  AdminCouponCreatePayload,
  AdminCouponListParams,
  AdminCouponUpdatePayload,
  PaginatedAdminCoupons,
} from '../types/coupon'

export async function listAdminCoupons(
  params: AdminCouponListParams = {},
): Promise<PaginatedAdminCoupons> {
  const response = await apiClient.get<PaginatedAdminCoupons>('/api/admin/coupons/', {
    params,
  })
  return response.data
}

export async function getAdminCoupon(couponId: string): Promise<AdminCoupon> {
  const response = await apiClient.get<AdminCoupon>(`/api/admin/coupons/${couponId}/`)
  return response.data
}

export async function createAdminCoupon(
  payload: AdminCouponCreatePayload,
): Promise<AdminCoupon> {
  const response = await apiClient.post<AdminCoupon>('/api/admin/coupons/', payload)
  return response.data
}

export async function updateAdminCoupon(
  couponId: string,
  payload: AdminCouponUpdatePayload,
): Promise<AdminCoupon> {
  const response = await apiClient.patch<AdminCoupon>(
    `/api/admin/coupons/${couponId}/`,
    payload,
  )
  return response.data
}

export async function deactivateAdminCoupon(couponId: string): Promise<AdminCoupon> {
  const response = await apiClient.delete<AdminCoupon>(`/api/admin/coupons/${couponId}/`)
  return response.data
}
