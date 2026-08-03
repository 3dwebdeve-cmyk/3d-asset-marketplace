import { apiClient } from './client'
import type { AdminAnalytics, AdminAnalyticsParams } from '../types/analytics'

function toAnalyticsQuery(params: AdminAnalyticsParams = {}): string {
  const query = new URLSearchParams()
  if (params.start_date) query.set('start_date', params.start_date)
  if (params.end_date) query.set('end_date', params.end_date)
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export async function getAdminAnalytics(
  params: AdminAnalyticsParams = {},
): Promise<AdminAnalytics> {
  const { data } = await apiClient.get<AdminAnalytics>(
    `/api/admin/analytics/${toAnalyticsQuery(params)}`,
  )
  return data
}
