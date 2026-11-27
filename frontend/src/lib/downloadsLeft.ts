import type { CustomerOrderItem } from '../types/order'

/** "4 downloads left" for a purchase that still has some, else null. */
export function downloadsLeftLabel(item: CustomerOrderItem): string | null {
  if (!item.can_download) return null
  const left = item.downloads_left
  return `${left} ${left === 1 ? 'download' : 'downloads'} left`
}
