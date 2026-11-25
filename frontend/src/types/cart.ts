import type { LineKind } from '../lib/packages'

export type CartProductType = 'product' | 'plugin'

export interface CartCatalogCategory {
  id: string
  name: string
  slug: string
}

export interface CartCatalogItem {
  name: string
  /** "<model name> - <package label>" for a model; the name for a plugin. */
  title: string
  package_kind: LineKind | ''
  package_label: string
  slug: string
  thumbnail: string
  price: string | null
  discount_price: string | null
  effective_price: string | null
  currency: string
  category: CartCatalogCategory
  is_available: boolean
}

export interface CartItem {
  id: string
  product_type: CartProductType
  product_id: string
  /** The package of a model, or 'bundle'; '' for a plugin. */
  package_kind: LineKind | ''
  quantity: number
  unit_price: string | null
  line_total: string | null
  catalog: CartCatalogItem | null
}

export interface Cart {
  id: string
  currency: string
  subtotal: string
  discount_amount: string
  total: string
  item_count: number
  total_quantity: number
  items: CartItem[]
}

export interface CartAddPayload {
  product_type: CartProductType
  product_id: string
  /** Required for a model (a package, or 'bundle' for All variations); leave out for a plugin. */
  package_kind?: LineKind
  quantity?: number
}

export interface CartUpdateQuantityPayload {
  quantity: number
}
