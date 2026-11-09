import { apiClient } from './client'

export interface AdminNotification {
  id: string
  title: string
  path: string
  created_at: string
  is_read: boolean
}
export interface AdminNotifications {
  unread_count: number
  results: AdminNotification[]
}
export async function getAdminNotifications(signal?: AbortSignal): Promise<AdminNotifications> {
  return (await apiClient.get<AdminNotifications>('/api/v1/admin/notifications/', { signal })).data
}
export async function markAdminNotificationsRead(id?: string): Promise<void> {
  await apiClient.post('/api/v1/admin/notifications/', id ? { id } : { all: true })
}
