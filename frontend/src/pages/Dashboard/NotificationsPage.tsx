import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../api/notificationsApi'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { getApiErrorMessage } from '../../lib/apiError'

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function isSafeInternalLink(link: string): boolean {
  return link.startsWith('/') && !link.startsWith('//')
}

export function NotificationsPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const listQuery = useQuery({
    queryKey: ['notifications', 'list', { page, unreadOnly }],
    queryFn: () =>
      listNotifications({
        page,
        page_size: 20,
        ordering: '-created_at',
        is_read: unreadOnly ? false : undefined,
      }),
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: invalidate,
  })

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: invalidate,
  })

  const results = listQuery.data?.results ?? []

  return (
    <main className="dashboard-page">
      <section
        className="dashboard-card dashboard-card--wide"
        aria-labelledby="notifications-title"
      >
        <p className="home-page__eyebrow">Customer Dashboard</p>
        <h1 id="notifications-title">Notifications</h1>
        <p className="home-page__subtitle">
          Project updates, deliveries, quotations, and order status changes.
        </p>

        <div className="admin-filters">
          <label className="notification-page__filter">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(event) => {
                setUnreadOnly(event.target.checked)
                setPage(1)
              }}
            />
            Unread only
          </label>
          <Button
            type="button"
            variant="secondary"
            disabled={markAllMutation.isPending}
            onClick={() => markAllMutation.mutate()}
          >
            Mark all read
          </Button>
          <Link className="auth-link" to="/dashboard">
            Back to dashboard
          </Link>
        </div>

        {listQuery.isLoading ? (
          <Spinner label="Loading notifications..." />
        ) : listQuery.isError ? (
          <ErrorState
            title="Could not load notifications"
            description={getApiErrorMessage(
              listQuery.error,
              'Your notifications could not be loaded.',
            )}
            action={
              <Button variant="secondary" onClick={() => listQuery.refetch()}>
                Retry
              </Button>
            }
          />
        ) : results.length === 0 ? (
          <p className="home-page__subtitle" role="status">
            {unreadOnly ? 'No unread notifications.' : 'You have no notifications yet.'}
          </p>
        ) : (
          <>
            <ul className="notification-page__list">
              {results.map((item) => (
                <li
                  key={item.id}
                  className={
                    item.is_read
                      ? 'notification-page__item'
                      : 'notification-page__item notification-page__item--unread'
                  }
                >
                  <div className="notification-page__item-body">
                    <h2 className="notification-page__item-title">{item.title}</h2>
                    <p className="notification-page__item-message">{item.message}</p>
                    <p className="notification-page__item-time">
                      {formatDate(item.created_at)}
                    </p>
                  </div>
                  <div className="notification-page__item-actions">
                    {!item.is_read ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={markReadMutation.isPending}
                        onClick={() => markReadMutation.mutate(item.id)}
                      >
                        Mark read
                      </Button>
                    ) : null}
                    {item.link && isSafeInternalLink(item.link) ? (
                      <Link className="auth-link" to={item.link}>
                        Open
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>

            <div className="dashboard-card__actions" aria-label="Notification pagination">
              <Button
                type="button"
                variant="secondary"
                disabled={!listQuery.data?.previous}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                Previous
              </Button>
              <span>Page {page}</span>
              <Button
                type="button"
                variant="secondary"
                disabled={!listQuery.data?.next}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
