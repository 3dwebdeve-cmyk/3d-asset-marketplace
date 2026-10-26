import { useRef } from 'react'

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
  const listRef = useRef<HTMLDivElement>(null)
  const AllIcon = getAllCategoriesIcon()

  return (
    <div className={`navbar__explore-menu navbar__category-picker ${className}`}>
      <div
        ref={listRef}
        className="navbar__category-list"
        style={{ gridTemplateRows: `repeat(${Math.ceil((categories.length + 1) / 2)}, auto)` }}
        role="menu"
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onClose()
            return
          }
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
          <button type="button" role="menuitem" className={`navbar__explore-item${selectedId === '' ? ' navbar__explore-item--active' : ''}`} onClick={() => onSelect('')}>
            <AllIcon className="navbar__explore-icon" />
            <span className="navbar__explore-label">All Categories</span>
          </button>
        {categories.map((category) => {
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

      </div>
    </div>
  )
}
