export interface AdminAnalyticsFilters {
  start_date: string
  end_date: string
}

export interface AdminAnalyticsSummary {
  order_count: number
  paid_order_count: number
  pending_order_count: number
  refunded_order_count: number
  cancelled_order_count: number
  revenue: string
  average_order_value: string
}

export interface AdminAnalyticsPeriod {
  period: string
  order_count: number
  revenue: string
}

export interface AdminAnalyticsTopItem {
  product_id: string
  product_type: 'product' | 'plugin' | string
  title: string
  slug: string
  quantity_sold: number
  order_count: number
  revenue: string
}

export interface AdminAnalyticsGatewayBreakdown {
  gateway: string
  payment_count: number
  revenue: string
}

export interface AdminAnalytics {
  filters: AdminAnalyticsFilters
  currency: string
  summary: AdminAnalyticsSummary
  revenue_by_period: AdminAnalyticsPeriod[]
  top_products: AdminAnalyticsTopItem[]
  top_plugins: AdminAnalyticsTopItem[]
  gateway_breakdown: AdminAnalyticsGatewayBreakdown[]
}

export interface AdminAnalyticsParams {
  start_date?: string
  end_date?: string
}
