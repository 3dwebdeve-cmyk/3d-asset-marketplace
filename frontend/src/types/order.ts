export type OrderStatus = 'pending' | 'paid' | 'cancelled' | 'refunded'

export type OrderPaymentStatus = 'pending' | 'paid' | 'cancelled' | 'refunded'

export type OrderItemProductType = 'product' | 'plugin'

export type OrderOrdering =
  | 'created_at'
  | '-created_at'
  | 'updated_at'
  | '-updated_at'
  | 'total_amount'
  | '-total_amount'
  | 'invoice_number'
  | '-invoice_number'
  | 'order_status'
  | '-order_status'
  | 'payment_status'
  | '-payment_status'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

export const ORDER_PAYMENT_STATUS_LABELS: Record<OrderPaymentStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}

export interface OrderCustomerBrief {
  id: string
  email: string
  full_name: string
}

export interface AdminOrderListItem {
  id: string
  invoice_number: string
  total_amount: string
  currency: string
  order_status: OrderStatus
  payment_status: OrderPaymentStatus
  customer: OrderCustomerBrief
  item_count: number
  created_at: string
  updated_at: string
}

export interface AdminOrderItem {
  id: string
  product_type: OrderItemProductType
  product_id: string
  title: string | null
  quantity: number
  purchase_price: string
  line_total: string
  created_at: string
  updated_at: string
}

export interface AdminOrder {
  id: string
  invoice_number: string
  total_amount: string
  currency: string
  order_status: OrderStatus
  payment_status: OrderPaymentStatus
  customer: OrderCustomerBrief
  items: AdminOrderItem[]
  items_total: string
  created_at: string
  updated_at: string
}

export interface PaginatedAdminOrders {
  count: number
  next: string | null
  previous: string | null
  results: AdminOrderListItem[]
}

export interface AdminOrderListParams {
  search?: string
  order_status?: OrderStatus
  payment_status?: OrderPaymentStatus
  customer_id?: string
  ordering?: OrderOrdering
  page?: number
  page_size?: number
}

export interface AdminOrderItemCreatePayload {
  product_type: OrderItemProductType
  product_id: string
  quantity: number
}

export interface AdminOrderCreatePayload {
  customer_id: string
  currency?: string
  items: AdminOrderItemCreatePayload[]
}

export interface CustomerOrderListItem {
  id: string
  invoice_number: string
  total_amount: string
  currency: string
  order_status: OrderStatus
  payment_status: OrderPaymentStatus
  item_count: number
  created_at: string
  updated_at: string
}

export interface CustomerOrderItem {
  id: string
  product_type: OrderItemProductType
  product_id: string
  title: string | null
  quantity: number
  purchase_price: string
  line_total: string
  created_at: string
  updated_at: string
}

export interface CustomerOrder extends CustomerOrderListItem {
  items: CustomerOrderItem[]
  items_total: string
}

export interface PaginatedCustomerOrders {
  count: number
  next: string | null
  previous: string | null
  results: CustomerOrderListItem[]
}

export interface CustomerOrderListParams {
  search?: string
  order_status?: OrderStatus
  payment_status?: OrderPaymentStatus
  ordering?: OrderOrdering
  page?: number
  page_size?: number
}
