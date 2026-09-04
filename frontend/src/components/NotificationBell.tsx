import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import {
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../api/notificationsApi'
import type { AppNotification } from '../types/notification'
import { Button } from './ui/Button'

function formatUnreadBadge(count: number): string {
  if (count > 99) return '99+'
  return String(count)
}

function formatRelativeTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function isSafeInternalLink(link: string): boolean {
  return link.startsWith('/') && !link.startsWith('//')
}

export function NotificationBell() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const panelId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: getUnreadNotificationCount,
    select: (data) => data.unread_count,
    refetchInterval: 60_000,
  })

  const listQuery = useQuery({
    queryKey: ['notifications', 'preview'],
    queryFn: () => listNotifications({ page: 1, page_size: 8, ordering: '-created_at' }),
    enabled: open,
  })

  const invalidateNotifications = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ])
  }

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: async () => {
      await invalidateNotifications()
    },
  })

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: async () => {
      await invalidateNotifications()
    },
  })

  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const unreadCount = unreadQuery.data ?? 0
  const items = listQuery.data?.results ?? []

  const handleItemActivate = async (item: AppNotification) => {
    if (!item.is_read) {
      await markReadMutation.mutateAsync(item.id)
    }
    setOpen(false)
    if (item.link && isSafeInternalLink(item.link)) {
      navigate(item.link)
    }
  }

  return (
    <div className="notification-bell" ref={rootRef}>
      <button
        type="button"
        className="navbar__icon-btn notification-bell__trigger"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : 'Notifications'
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path d="M6 9a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </svg>
        {unreadCount > 0 ? (
          <span
            className="project-unread-badge notification-bell__badge"
            aria-hidden="true"
          >
            {formatUnreadBadge(unreadCount)}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          className="notification-bell__panel"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="notification-bell__header">
            <h2 className="notification-bell__title">Notifications</h2>
            <Button
              type="button"
              variant="secondary"
              disabled={unreadCount === 0 || markAllMutation.isPending}
              onClick={() => markAllMutation.mutate()}
            >
              Mark all read
            </Button>
          </div>

          {listQuery.isLoading ? (
            <p className="notification-bell__status" role="status">
              Loading notifications...
            </p>
          ) : listQuery.isError ? (
            <p className="notification-bell__status" role="alert">
              Could not load notifications.
            </p>
          ) : items.length === 0 ? (
            <p className="notification-bell__status" role="status">
              You have no notifications yet.
            </p>
          ) : (
            <ul className="notification-bell__list">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={
                      item.is_read
                        ? 'notification-bell__item'
                        : 'notification-bell__item notification-bell__item--unread'
                    }
                    onClick={() => {
                      void handleItemActivate(item)
                    }}
                  >
                    <span className="notification-bell__item-title">{item.title}</span>
                    <span className="notification-bell__item-message">{item.message}</span>
                    <span className="notification-bell__item-time">
                      {formatRelativeTime(item.created_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="notification-bell__footer">
            <Link
              className="auth-link"
              to="/dashboard/notifications"
              onClick={() => setOpen(false)}
            >
              View all notifications
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
