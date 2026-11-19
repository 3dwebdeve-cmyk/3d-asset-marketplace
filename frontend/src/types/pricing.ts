/** Pricing page API (docs/PRICING_PIPELINE.md, Part 2; per package: docs/PACKAGES_PIPELINE.md).
 * Money is a string with two decimals. */

import type { PackageKind } from '../lib/packages'

export type PricingTab = 'waiting' | 'live'
export type PolyTier = 'low' | 'mid' | 'high' | 'unknown'
export type PricingRuleKind = 'hours_price' | 'set_price' | 'percent_off' | 'amount_off' | 'remove_sale'

export const POLY_TIER_LABELS: Record<PolyTier, string> = {
  low: 'Low poly',
  mid: 'Mid poly',
  high: 'High poly',
  unknown: 'Unknown',
}

export const DEFAULT_LOW_BELOW = 10_000
export const DEFAULT_HIGH_ABOVE = 100_000
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
  poly_tier: PolyTier
  /** Hours spent (from the uploader, editable here) and the rate per hour: base = hours x rate. */
  hours_spent: string | null
  hourly_rate: string | null
  /** This model's own package percents; a package that is missing uses the default. */
  package_percents: Partial<Record<PackageKind, string>>
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
  /** The package a one-package rule prices; the hours rule prices every package. */
  package_kind: PackageKind
  price?: string
  /** Hours rule: the sale only applies while this switch is on (off by default). */
  sale_enabled?: boolean
  sale_percent?: string
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
  /** The package this row prices (the hours rule has a row per model and package). */
  package_kind: PackageKind | null
  package_label: string | null
  /** False: the model has no package of this kind; it is listed and left alone. */
  has_package: boolean
  old_price: string | null
  old_sale_price: string | null
  old_sale_ends_at: string | null
  new_price: string | null
  new_sale_price: string | null
  new_sale_ends_at: string | null
  amount_off: string
  percent_off: string
  buyer_pays: string | null
  changed: boolean
  error: string
  /** Every package of the model, the chosen one with its new values. */
  packages: PricingPackage[]
  bundle_warning: string
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
    /** Models without the chosen package (left alone). */
    without_package: number
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

/** Each model's own hours, rate and percents; only the keys sent change. */
export interface PricingInputItem {
  id: string
  hours_spent?: string | null
  hourly_rate?: string | null
  /** A null percent goes back to the default. */
  package_percents?: Partial<Record<PackageKind, string | null>>
}

export type PackagePercents = Record<PackageKind, string>

export const MAX_PACKAGE_PERCENT = 200
