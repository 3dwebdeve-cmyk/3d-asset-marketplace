import { apiClient } from './client'
import { newId } from '../lib/ids'
import { currentAcceptedLegalPayload } from '../lib/legalDocuments'
import type {
  AdminPaymentDetail,
  AdminPaymentListParams,
  CheckoutItem,
  CheckoutSessionResponse,
  ConfirmCheckoutResponse,
  PaginatedAdminPayments,
} from '../types/payment'

/**
 * Without `items` the whole cart is bought; with it, only those cart lines. Call it only after
 * the buyer ticked the immediate-access box (useWithdrawalWaiver): it sends that consent.
 */
export async function createCheckoutSession(
  acceptedLegal: Record<string, string> = currentAcceptedLegalPayload(),
  items?: CheckoutItem[],
): Promise<CheckoutSessionResponse> {
  const body = { accepted_legal: acceptedLegal, withdrawal_waiver: true }
  const { data } = await apiClient.post<CheckoutSessionResponse>(
    '/api/v1/payments/checkout/',
    items ? { ...body, items } : body,
    { headers: { 'Idempotency-Key': newId() } },
  )
  return data
}

export async function confirmCheckoutSession(
  orderId: string,
): Promise<ConfirmCheckoutResponse> {
  const { data } = await apiClient.post<ConfirmCheckoutResponse>('/api/v1/payments/confirm/', {
    order_id: orderId,
  })
  return data
}

function toAdminQuery(params: AdminPaymentListParams = {}): string {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.status) query.set('status', params.status)
  if (params.created_after) query.set('created_after', params.created_after)
  if (params.created_before) query.set('created_before', params.created_before)
  if (params.ordering) query.set('ordering', params.ordering)
  if (params.page) query.set('page', String(params.page))
  if (params.page_size) query.set('page_size', String(params.page_size))
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export async function listAdminPayments(
  params: AdminPaymentListParams = {},
): Promise<PaginatedAdminPayments> {
  const { data } = await apiClient.get<PaginatedAdminPayments>(
    `/api/v1/admin/payments/${toAdminQuery(params)}`,
  )
  return data
}

export async function getAdminPayment(paymentId: string): Promise<AdminPaymentDetail> {
  const { data } = await apiClient.get<AdminPaymentDetail>(
    `/api/v1/admin/payments/${paymentId}/`,
  )
  return data
}
