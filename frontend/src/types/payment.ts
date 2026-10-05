export interface CheckoutSessionResponse {
  checkout_url: string
  order_id: string
  project_id?: string
}

export interface ConfirmCheckoutResponse {
  order_id: string
  payment_status: string
  order_status: string
}

export type PaymentStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'expired'
  | 'refunded'
  | 'disputed'

export type PaymentStatusFilter =
  | PaymentStatus
  | 'paid'
  | 'cancelled'
  | 'canceled'

export type PaymentOrdering =
  | 'created_at'
  | '-created_at'
  | 'amount'
  | '-amount'
  | 'status'
  | '-status'
  | 'updated_at'
  | '-updated_at'

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  succeeded: 'Paid',
  failed: 'Failed',
  expired: 'Cancelled',
  refunded: 'Refunded',
  disputed: 'Disputed',
}

export interface AdminPaymentListItem {
  id: string
  created_at: string
  updated_at: string
  customer_email: string
  invoice_number: string
  order_id: string
  amount: string
  currency: string
  status: PaymentStatus
  gateway: string
  stripe_checkout_session_id: string
  stripe_payment_intent_id: string
}

export interface AdminPaymentOrderSummary {
  id: string
  invoice_number: string
  order_status: string
  payment_status: string
  total_amount: string
  currency: string
}

export interface AdminPaymentDetail
  extends Omit<AdminPaymentListItem, 'order_id' | 'invoice_number'> {
  customer_full_name: string
  order: AdminPaymentOrderSummary
}

export interface AdminPaymentListParams {
  search?: string
  status?: PaymentStatusFilter
  created_after?: string
  created_before?: string
  ordering?: PaymentOrdering
  page?: number
  page_size?: number
}

export interface PaginatedAdminPayments {
  count: number
  next: string | null
  previous: string | null
  results: AdminPaymentListItem[]
}
