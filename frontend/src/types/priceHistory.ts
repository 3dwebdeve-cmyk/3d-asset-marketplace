export type PriceChangeSource =
  | 'admin_edit'
  | 'qa_approval'
  | 'pricing_page'
  | 'import'
  | 'sale_ended'

export interface PriceChangeActor {
  id: string
  full_name: string
  email: string
}

export interface ProductPriceChange {
  id: string
  source: PriceChangeSource
  source_label: string
  batch_id: string
  currency: string
  old_price: string | null
  new_price: string | null
  old_discount_price: string | null
  new_discount_price: string | null
  old_discount_ends_at: string | null
  new_discount_ends_at: string | null
  created_at: string
  changed_by: PriceChangeActor | null
}

export interface ProductPriceHistory {
  results: ProductPriceChange[]
}
