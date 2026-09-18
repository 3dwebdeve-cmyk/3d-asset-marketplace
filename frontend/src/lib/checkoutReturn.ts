/** Survive Stripe round-trips when the success URL query is lost after re-login. */
const PENDING_CHECKOUT_ORDER_KEY = 'pending_checkout_order_id'

export function rememberCheckoutOrderId(orderId: string): void {
  const trimmed = orderId.trim()
  if (!trimmed || typeof sessionStorage === 'undefined') {
    return
  }
  sessionStorage.setItem(PENDING_CHECKOUT_ORDER_KEY, trimmed)
}

export function peekCheckoutOrderId(): string | null {
  if (typeof sessionStorage === 'undefined') {
    return null
  }
  return sessionStorage.getItem(PENDING_CHECKOUT_ORDER_KEY)
}

export function clearCheckoutOrderId(): void {
  if (typeof sessionStorage === 'undefined') {
    return
  }
  sessionStorage.removeItem(PENDING_CHECKOUT_ORDER_KEY)
}
