/** Pricing page API (docs/PRICING_PIPELINE.md; per package: docs/PACKAGES_PIPELINE.md).
 * Money is a string with two decimals. */

import type { PackageKind } from '../lib/packages'

export type PricingTab = 'waiting' | 'live'

export const MAX_MODELS_PER_ACTION = 200

/** One package of a model with what a buyer pays for it now (price null: not sold yet). */
export interface PricingPackage {
  kind: PackageKind
  label: string
  price: string | null
  sale_price: string | null
  sale_ends_at: string | null
  buyer_pays: string | null
}

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
  /** Hours spent on the model (from the uploader, editable here). */
  hours_spent: string | null
  price: string
  currency: string
  discount_price: string | null
  discount_ends_at: string | null
  discount_active: boolean
  /** The cheapest priced package's price: what the store shows as "From". */
  buyer_pays: string
  packages: PricingPackage[]
  /** Server bundle check: Whole File should be the better deal; '' when fine. Never blocks. */
  bundle_warning: string
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
  search?: string
  import_batch_id?: string
  ordering?: string
  page?: number
  page_size?: number
}

/** The selection, the rate per hour and the percent of the base price for every package. */
export interface PricingInputBody {
  product_ids: string[]
  rate: string
  percents: Record<PackageKind, string>
}

export interface PricingCalcPackage {
  kind: PackageKind
  label: string
  old_price: string | null
  price: string
}

export interface PricingCalcRow {
  id: string
  name: string
  sku: string | null
  hours_spent: string | null
  /** Why the model cannot be priced ('' when it can). */
  error: string
  /** Only the packages the model has. */
  packages: PricingCalcPackage[]
}

export interface PricingCalculation {
  rows: PricingCalcRow[]
  summary: { models: number; priced: number; errors: number; currency: string }
  preview_token: string
}

export interface PricingPublishRequest extends PricingInputBody {
  preview_token: string
  confirm_count: number
}

export interface PricingPublishResult {
  batch_id: string
  models: number
  published: number
  failed: number
  results: { id: string; name: string; sku: string | null; published: boolean; reason: string }[]
}
