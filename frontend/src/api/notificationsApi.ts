import { apiClient } from './client'
import type {
  AppNotification,
  MarkAllReadResponse,
  NotificationListParams,
  PaginatedNotifications,
  UnreadCountResponse,
} from '../types/notification'

function toQuery(params: NotificationListParams = {}): string {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.page_size) query.set('page_size', String(params.page_size))
  if (typeof params.is_read === 'boolean') {
    query.set('is_read', params.is_read ? 'true' : 'false')
  }
  if (params.ordering) query.set('ordering', params.ordering)
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export async function listNotifications(
  params: NotificationListParams = {},
): Promise<PaginatedNotifications> {
  const { data } = await apiClient.get<PaginatedNotifications>(
    `/api/notifications/${toQuery(params)}`,
  )
  return data
}

export async function getUnreadNotificationCount(): Promise<UnreadCountResponse> {
  const { data } = await apiClient.get<UnreadCountResponse>(
    '/api/notifications/unread-count/',
  )
  return data
}

export async function markNotificationRead(
  notificationId: string,
): Promise<AppNotification> {
  const { data } = await apiClient.post<AppNotification>(
    `/api/notifications/${notificationId}/read/`,
  )
  return data
}

export async function markAllNotificationsRead(): Promise<MarkAllReadResponse> {
  const { data } = await apiClient.post<MarkAllReadResponse>(
    '/api/notifications/read-all/',
  )
  return data
}
