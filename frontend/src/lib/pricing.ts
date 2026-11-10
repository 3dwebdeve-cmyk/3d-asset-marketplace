/** Shared pricing helpers for catalog detail pages. */

/** A sale end (ISO UTC from the API) in the visitor's own time, e.g. "30 Nov 2026, 6:30 pm". */
export function formatSaleEnd(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export function discountPercent(price: string, discountPrice: string): number | null {
  const original = Number(price)
  const discounted = Number(discountPrice)
  if (
    Number.isNaN(original) ||
    Number.isNaN(discounted) ||
    original <= 0 ||
    discounted >= original
  ) {
    return null
  }
  return Math.round(((original - discounted) / original) * 100)
}
