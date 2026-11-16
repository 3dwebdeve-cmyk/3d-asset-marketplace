import type { PackageKind } from '../lib/packages'

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
  package_kind: PackageKind | ''
  package_label: string
  /** On a Whole File line when the cart also holds other packages of that model. */
  bundle_hint: string
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
  /** The package of a model; '' for a plugin. */
  package_kind: PackageKind | ''
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
  /** Required for a model; leave out for a plugin. */
  package_kind?: PackageKind
  quantity?: number
}

export interface CartUpdateQuantityPayload {
  quantity: number
}
