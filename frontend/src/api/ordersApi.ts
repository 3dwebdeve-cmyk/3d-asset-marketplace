import { apiClient } from './client'
import type {
  AdminOrder,
  AdminOrderCreatePayload,
  AdminOrderListParams,
  AdminOrderStatusUpdatePayload,
  CustomerOrder,
  CustomerOrderListParams,
  PaginatedAdminOrders,
  PaginatedCustomerOrders,
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
    `/api/v1/admin/orders/${toQuery(params)}`,
  )
  return data
}

export async function getAdminOrder(orderId: string): Promise<AdminOrder> {
  const { data } = await apiClient.get<AdminOrder>(`/api/v1/admin/orders/${orderId}/`)
  return data
}

export async function createAdminOrder(
  payload: AdminOrderCreatePayload,
): Promise<AdminOrder> {
  const { data } = await apiClient.post<AdminOrder>('/api/v1/admin/orders/', payload)
  return data
}

export async function updateAdminOrderStatus(
  orderId: string,
  payload: AdminOrderStatusUpdatePayload,
): Promise<AdminOrder> {
  const { data } = await apiClient.patch<AdminOrder>(
    `/api/v1/admin/orders/${orderId}/`,
    payload,
  )
  return data
}

function toCustomerQuery(params: CustomerOrderListParams = {}): string {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.order_status) query.set('order_status', params.order_status)
  if (params.payment_status) query.set('payment_status', params.payment_status)
  if (params.ordering) query.set('ordering', params.ordering)
  if (params.page) query.set('page', String(params.page))
  if (params.page_size) query.set('page_size', String(params.page_size))
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export async function listCustomerOrders(
  params: CustomerOrderListParams = {},
): Promise<PaginatedCustomerOrders> {
  const { data } = await apiClient.get<PaginatedCustomerOrders>(
    `/api/v1/orders/${toCustomerQuery(params)}`,
  )
  return data
}

export async function getCustomerOrder(orderId: string): Promise<CustomerOrder> {
  const { data } = await apiClient.get<CustomerOrder>(`/api/v1/orders/${orderId}/`)
  return data
}

function triggerBlobDownload(data: Blob, fileName: string): void {
  const objectUrl = URL.createObjectURL(data)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}

export async function downloadCustomerOrderInvoice(
  orderId: string,
  invoiceNumber: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(`/api/v1/orders/${orderId}/invoice/`, {
    responseType: 'blob',
  })
  triggerBlobDownload(data, `invoice-${invoiceNumber}.pdf`)
}

export async function downloadAdminOrderInvoice(
  orderId: string,
  invoiceNumber: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(`/api/v1/admin/orders/${orderId}/invoice/`, {
    responseType: 'blob',
  })
  triggerBlobDownload(data, `invoice-${invoiceNumber}.pdf`)
}
