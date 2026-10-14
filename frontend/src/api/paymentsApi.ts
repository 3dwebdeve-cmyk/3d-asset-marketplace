import { apiClient } from './client'
import { newId } from '../lib/ids'
import { currentAcceptedLegalPayload } from '../lib/legalDocuments'
import type {
  AdminPaymentDetail,
  AdminPaymentListParams,
  CheckoutSessionResponse,
  ConfirmCheckoutResponse,
  PaginatedAdminPayments,
} from '../types/payment'

export async function createCheckoutSession(
  acceptedLegal: Record<string, string> = currentAcceptedLegalPayload(),
): Promise<CheckoutSessionResponse> {
  const { data } = await apiClient.post<CheckoutSessionResponse>(
    '/api/v1/payments/checkout/',
    { accepted_legal: acceptedLegal },
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
