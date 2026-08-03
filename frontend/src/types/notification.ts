export interface AppNotification {
  id: string
  title: string
  message: string
  link: string
  is_read: boolean
  created_at: string
  updated_at: string
}

export interface PaginatedNotifications {
  count: number
  next: string | null
  previous: string | null
  results: AppNotification[]
}

export interface NotificationListParams {
  page?: number
  page_size?: number
  is_read?: boolean
  ordering?: string
}

export interface UnreadCountResponse {
  unread_count: number
}

export interface MarkAllReadResponse {
  updated: number
  unread_count: number
}
