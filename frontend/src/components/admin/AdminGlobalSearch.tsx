import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'
import { searchAdmin, type AdminSearchResults } from '../../api/adminSearchApi'
import { adminPath } from '../../config/adminPaths'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { AdminIcon } from './AdminIcon'
import '../../styles/admin-search.css'

const GROUPS: { key: keyof AdminSearchResults; label: string }[] = [
  { key: 'products', label: 'Models' }, { key: 'plugins', label: 'Plugins' },
  { key: 'users', label: 'Customers and users' }, { key: 'orders', label: 'Orders' },
]

export function AdminGlobalSearch() {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const resultsId = useId()
  const location = useLocation()
  const query = text.trim()
  const debounced = useDebouncedValue(query, 300)
  const results = useQuery({
    queryKey: ['admin-global-search', debounced],
    queryFn: ({ signal }) => searchAdmin(debounced, signal),
    enabled: open && debounced.length >= 2 && query === debounced,
    gcTime: 0,
    retry: false,
  })

  useEffect(() => {
    setOpen(false)
    setText('')
  }, [location.pathname, location.search])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        input.current?.focus()
        setOpen(true)
      }
      if (event.key === 'Escape' && container.current?.contains(document.activeElement)) {
        event.preventDefault()
        input.current?.focus()
        setOpen(false)
      }
    }
    const outside = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', keydown)
    document.addEventListener('pointerdown', outside)
    return () => {
      document.removeEventListener('keydown', keydown)
      document.removeEventListener('pointerdown', outside)
    }
  }, [])

  const searching = query !== debounced || results.isFetching
  const data = !searching && !results.isError ? results.data : undefined
  const empty = data && GROUPS.every(({ key }) => data[key].length === 0)

  return <div ref={container} className="admin-header__search admin-global-search"
    role="search" aria-label="Admin records"
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}
    onKeyDown={(event) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      const links = Array.from(container.current?.querySelectorAll<HTMLAnchorElement>('a') ?? [])
      if (!links.length) return
      event.preventDefault()
      const current = links.indexOf(document.activeElement as HTMLAnchorElement)
      const next = current < 0 ? (event.key === 'ArrowDown' ? 0 : links.length - 1)
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + links.length) % links.length
      links[next]?.focus()
    }}>
    <AdminIcon name="search" size={16} />
    <input ref={input} type="search" className="admin-header__search-input" maxLength={120}
      placeholder="Search models, plugins, users, orders…" aria-label="Search admin records"
      aria-controls={open ? resultsId : undefined} aria-describedby={open ? `${resultsId}-status` : undefined}
      value={text} onFocus={() => setOpen(true)} onClick={() => setOpen(true)}
      onChange={(event) => { setText(event.target.value); setOpen(true) }} />
    <kbd className="admin-header__kbd">Ctrl / ⌘ K</kbd>
    {open && <div id={resultsId} className="admin-search-results" aria-label="Search results">
      <p id={`${resultsId}-status`} role="status" className="admin-search-status">
        {query.length < 2 ? 'Type at least 2 characters to search.' : searching ? 'Searching…'
          : results.isError ? 'Search could not load.' : empty ? 'No results found.'
            : 'Up to 5 matches per group. Use arrow keys or Tab to choose a result.'}
      </p>
      {query.length >= 2 && !searching && results.isError && <button type="button" onClick={() => results.refetch()}>Try again</button>}
      {query.length >= 2 && data && GROUPS.map(({ key, label }) => data[key].length > 0 && <section key={key}>
        <h2>{label}</h2>
        <ul>{data[key].map((item) => <li key={item.id}>
          <Link to={adminPath(`${key}/${item.id}`)} onClick={() => { setOpen(false); setText('') }}>
            <span>{item.label}</span><small>{item.detail}</small>
          </Link>
        </li>)}</ul>
      </section>)}
    </div>}
  </div>
}
