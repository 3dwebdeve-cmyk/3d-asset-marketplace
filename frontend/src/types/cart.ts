export type CartProductType = 'product' | 'plugin'

export interface CartCatalogCategory {
  id: string
  name: string
  slug: string
}

export interface CartCatalogItem {
  name: string
  slug: string
  thumbnail: string
  price: string
  discount_price: string | null
  effective_price: string
  currency: string
  category: CartCatalogCategory
  is_available: boolean
}

export interface CartItem {
  id: string
  product_type: CartProductType
  product_id: string
  quantity: number
  unit_price: string | null
  line_total: string | null
  catalog: CartCatalogItem | null
}

export type CouponDiscountType = 'percent' | 'fixed'

export interface AppliedCoupon {
  code: string
  discount_type: CouponDiscountType
  discount_value: string
}

export interface Cart {
  id: string
  currency: string
  subtotal: string
  discount_amount: string
  total: string
  item_count: number
  total_quantity: number
  coupon: AppliedCoupon | null
  items: CartItem[]
}

export interface CartAddPayload {
  product_type: CartProductType
  product_id: string
  quantity?: number
}

export interface CartUpdateQuantityPayload {
  quantity: number
}

export interface CartApplyCouponPayload {
  code: string
}
