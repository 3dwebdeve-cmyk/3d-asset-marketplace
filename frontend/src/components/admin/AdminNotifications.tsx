import { useEffect, useId, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { getAdminNotifications, markAdminNotificationsRead } from '../../api/adminNotificationsApi'
import { AdminIcon } from './AdminIcon'
import '../../styles/admin-notifications.css'

const queryKey = ['admin-notifications']

export function AdminNotifications() {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const bell = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const client = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const notices = useQuery({
    queryKey, queryFn: ({ signal }) => getAdminNotifications(signal),
    refetchInterval: 60_000, refetchIntervalInBackground: false, gcTime: 0, retry: false,
  })
  const read = useMutation({
    mutationFn: ({ id }: { id?: string; path?: string }) => markAdminNotificationsRead(id),
    onSuccess: async (_, { path }) => {
      await client.invalidateQueries({ queryKey })
      if (path) { setOpen(false); navigate(path) }
    },
  })

  useEffect(() => { setOpen(false) }, [location.pathname, location.search])
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [])
  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); bell.current?.focus(); setOpen(false)
      }
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [open])

  const count = notices.data?.unread_count ?? 0
  return <div className="admin-notifications" ref={container}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}>
    <button ref={bell} type="button" className="admin-header__icon-button admin-notifications__bell"
      aria-label={count ? `Notifications, ${count} unread` : 'Notifications'}
      aria-expanded={open} aria-controls={open ? panelId : undefined}
      onClick={() => { if (!open) { read.reset(); void notices.refetch() } setOpen(!open) }}>
      <AdminIcon name="bell" size={18} />
      {count > 0 && <span className="admin-notifications__badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
    </button>
    {open && <section id={panelId} className="admin-notifications__panel" aria-label="Admin notifications">
      <header><h2>Notifications</h2><button type="button" disabled={!count || read.isPending}
        onClick={() => read.mutate({})}>Mark all as read</button></header>
      {notices.isPending && <p role="status">Loading notifications…</p>}
      {notices.isError && <p role="alert">Could not load notifications. <button type="button" onClick={() => notices.refetch()}>Try again</button></p>}
      {read.isError && <p role="alert">Could not mark as read. Please try again.</p>}
      {notices.data?.results.length === 0 && <p>No notifications yet.</p>}
      <ul>{notices.data?.results.map((notice) => <li key={notice.id}>
        <Link to={notice.path} className={notice.is_read ? '' : 'admin-notifications__unread'}
          onClick={(event) => {
            if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
            event.preventDefault()
            if (!read.isPending) read.mutate({ id: notice.id, path: notice.path })
          }}>
          <span>{notice.title}</span>{!notice.is_read && <span className="admin-notifications__new">Unread</span>}
          <time dateTime={notice.created_at}>{new Date(notice.created_at).toLocaleString()}</time>
        </Link>
      </li>)}</ul>
      <footer>Latest 30 active notifications. <Link to="/console/products?status=pending_review">Open approval queue</Link></footer>
    </section>}
  </div>
}
