/** Pricing page API (docs/PRICING_PIPELINE.md, Part 2). Money is a string with two decimals. */

export type PricingTab = 'waiting' | 'live'
export type PolyTier = 'low' | 'mid' | 'high' | 'unknown'
export type PricingRuleKind = 'set_price' | 'tier_price' | 'percent_off' | 'amount_off' | 'remove_sale'

export const POLY_TIER_LABELS: Record<PolyTier, string> = {
  low: 'Low poly',
  mid: 'Mid poly',
  high: 'High poly',
  unknown: 'Unknown',
}

export const DEFAULT_LOW_BELOW = 10_000
export const DEFAULT_HIGH_ABOVE = 100_000
export const MAX_MODELS_PER_ACTION = 200

export interface PricingRow {
  id: string
  name: string
  sku: string | null
  slug: string
  thumbnail: string
  status: 'awaiting_price' | 'published'
  pending_update: boolean
  category: { id: string; name: string; parent_id: string | null }
  polygon_count: number | null
  poly_tier: PolyTier
  price: string
  currency: string
  discount_price: string | null
  discount_ends_at: string | null
  discount_active: boolean
  buyer_pays: string
  import_batch_id: string
  created_at: string
}

export interface PaginatedPricingRows {
  count: number
  next: string | null
  previous: string | null
  results: PricingRow[]
}

export interface PricingListParams {
  tab: PricingTab
  category_id?: string
  subcategory_id?: string
  poly?: PolyTier
  low_below?: number
  high_above?: number
  search?: string
  import_batch_id?: string
  ordering?: string
  page?: number
  page_size?: number
}

export interface PricingRuleRequest {
  product_ids: string[]
  rule: PricingRuleKind
  price?: string
  tier_prices?: Partial<Record<PolyTier, string>>
  percent?: string
  amount?: string
  round_99?: boolean
  /** ISO 8601 UTC, or null for a sale with no end. */
  discount_ends_at?: string | null
  low_below?: number
  high_above?: number
}

export interface PricingPreviewRow {
  id: string
  name: string
  sku: string | null
  status: string
  polygon_count: number | null
  poly_tier: PolyTier
  currency: string
  old_price: string
  old_sale_price: string | null
  old_sale_ends_at: string | null
  new_price: string
  new_sale_price: string | null
  new_sale_ends_at: string | null
  amount_off: string
  percent_off: string
  buyer_pays: string
  changed: boolean
  error: string
}

export interface PricingPreview {
  rows: PricingPreviewRow[]
  summary: {
    models: number
    changed: number
    errors: number
    currency: string
    buyer_pays_before: string
    buyer_pays_after: string
    needs_confirmation: boolean
  }
  preview_token: string
}

export interface PricingApplyRequest extends PricingRuleRequest {
  preview_token: string
  confirm_count?: number
}

export interface PricingApplyResult {
  batch_id: string
  models: number
  changed: number
  unchanged: number
}

export interface PricingPublishResult {
  models: number
  published: number
  failed: number
  results: { id: string; name: string; sku: string | null; published: boolean; reason: string }[]
}
