import { apiClient } from './client'
import type {
  AdminOrder,
  AdminOrderCreatePayload,
  AdminOrderListParams,
  PaginatedAdminOrders,
} from '../types/order'

function toQuery(params: AdminOrderListParams = {}): string {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.order_status) query.set('order_status', params.order_status)
  if (params.payment_status) query.set('payment_status', params.payment_status)
  if (params.customer_id) query.set('customer_id', params.customer_id)
  if (params.ordering) query.set('ordering', params.ordering)
  if (params.page) query.set('page', String(params.page))
  if (params.page_size) query.set('page_size', String(params.page_size))
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export async function listAdminOrders(
  params: AdminOrderListParams = {},
): Promise<PaginatedAdminOrders> {
  const { data } = await apiClient.get<PaginatedAdminOrders>(
    `/api/admin/orders/${toQuery(params)}`,
  )
  return data
}

export async function getAdminOrder(orderId: string): Promise<AdminOrder> {
  const { data } = await apiClient.get<AdminOrder>(`/api/admin/orders/${orderId}/`)
  return data
}

export async function createAdminOrder(
  payload: AdminOrderCreatePayload,
): Promise<AdminOrder> {
  const { data } = await apiClient.post<AdminOrder>('/api/admin/orders/', payload)
  return data
}
