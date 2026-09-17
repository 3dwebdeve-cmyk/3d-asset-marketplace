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
  const response = await apiClient.get<PaginatedAdminCoupons>('/api/v1/admin/coupons/', {
    params,
  })
  return response.data
}

export async function getAdminCoupon(couponId: string): Promise<AdminCoupon> {
  const response = await apiClient.get<AdminCoupon>(`/api/v1/admin/coupons/${couponId}/`)
  return response.data
}

export async function createAdminCoupon(
  payload: AdminCouponCreatePayload,
): Promise<AdminCoupon> {
  const response = await apiClient.post<AdminCoupon>('/api/v1/admin/coupons/', payload)
  return response.data
}

export async function updateAdminCoupon(
  couponId: string,
  payload: AdminCouponUpdatePayload,
): Promise<AdminCoupon> {
  const response = await apiClient.patch<AdminCoupon>(
    `/api/v1/admin/coupons/${couponId}/`,
    payload,
  )
  return response.data
}

export async function deactivateAdminCoupon(couponId: string): Promise<AdminCoupon> {
  const response = await apiClient.delete<AdminCoupon>(`/api/v1/admin/coupons/${couponId}/`)
  return response.data
}
