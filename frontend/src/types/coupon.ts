export type CouponDiscountType = 'percent' | 'fixed'

export interface AdminCoupon {
  id: string
  code: string
  discount_type: CouponDiscountType
  discount_value: string
  expiry_date: string | null
  active: boolean
  max_uses: number | null
  max_uses_per_user: number | null
  times_used: number
  created_at: string
  updated_at: string
}

export interface AdminCouponCreatePayload {
  code: string
  discount_type: CouponDiscountType
  discount_value: string
  expiry_date?: string | null
  active?: boolean
  max_uses?: number | null
  max_uses_per_user?: number | null
}

export interface AdminCouponUpdatePayload {
  code?: string
  discount_type?: CouponDiscountType
  discount_value?: string
  expiry_date?: string | null
  active?: boolean
  max_uses?: number | null
  max_uses_per_user?: number | null
}

export interface PaginatedAdminCoupons {
  count: number
  next: string | null
  previous: string | null
  results: AdminCoupon[]
}

export interface AdminCouponListParams {
  page?: number
  page_size?: number
  active?: boolean
  discount_type?: CouponDiscountType
  search?: string
  ordering?: string
}
