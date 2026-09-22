/** Shared pricing helpers for catalog detail pages. */

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
