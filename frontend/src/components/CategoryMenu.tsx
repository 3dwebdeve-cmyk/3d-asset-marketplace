import { useRef, useState } from 'react'

import type { CategoryPublic } from '../types/category'
import { getAllCategoriesIcon, getCategoryIcon } from './categoryIcons'

type CategoryMenuProps = {
  categories: CategoryPublic[]
  selectedId: string
  label: string
  loading: boolean
  error: boolean
  className?: string
  onSelect: (id: string) => void
  onClose: () => void
}

export function CategoryMenu({
  categories, selectedId, label, loading, error, className = '', onSelect, onClose,
}: CategoryMenuProps) {
  const [query, setQuery] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const normalizedQuery = query.trim().toLowerCase()
  const matches = categories.filter((category) =>
    category.name.toLowerCase().includes(normalizedQuery),
  )
  const AllIcon = getAllCategoriesIcon()

  return (
    <div className={`navbar__explore-menu navbar__category-picker ${className}`}>
      <div className="navbar__category-picker-header">
        <span>Select Your Category</span>
        <button type="button" className="navbar__category-close" aria-label="Close categories" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <label className="navbar__category-search">
        <input
          type="search"
          aria-label="Search categories"
          placeholder="Search categories"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.preventDefault()
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              listRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
            }
          }}
        />
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
      </label>
      <div
        ref={listRef}
        className="navbar__category-list"
        role="menu"
        aria-label={label}
        onKeyDown={(event) => {
          if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
          const items = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])
          if (!items.length) return
          event.preventDefault()
          const current = items.indexOf(document.activeElement as HTMLButtonElement)
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
          items[next]?.focus()
        }}
      >
        {!normalizedQuery || 'all categories'.includes(normalizedQuery) ? (
          <button type="button" role="menuitem" className={`navbar__explore-item${selectedId === '' ? ' navbar__explore-item--active' : ''}`} onClick={() => onSelect('')}>
            <AllIcon className="navbar__explore-icon" />
            <span className="navbar__explore-label">All Categories</span>
          </button>
        ) : null}
        {matches.map((category) => {
          const Icon = getCategoryIcon(category.slug)
          return (
            <button
              type="button"
              role="menuitem"
              className={`navbar__explore-item${selectedId === category.id ? ' navbar__explore-item--active' : ''}`}
              key={category.id}
              onClick={() => onSelect(category.id)}
            >
              <Icon className="navbar__explore-icon" />
              <span className="navbar__explore-label">{category.name}</span>
            </button>
          )
        })}
      </div>
      <div className="navbar__category-feedback" role="status">
        {loading ? <p className="navbar__explore-status">Loading categories…</p> : null}
        {error ? <p className="navbar__explore-status">Categories could not be loaded.</p> : null}
        {!loading && !error && normalizedQuery && !matches.length && !'all categories'.includes(normalizedQuery) ? (
          <p className="navbar__explore-status">No categories found. Try another search.</p>
        ) : null}
      </div>
    </div>
  )
}
