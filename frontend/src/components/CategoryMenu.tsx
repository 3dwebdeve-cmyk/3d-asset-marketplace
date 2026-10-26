import { useRef, useState } from 'react'

import type { CategoryTreeNode } from '../lib/categoryTree'
import { getAllCategoriesIcon, getCategoryIcon } from './categoryIcons'

type CategoryMenuProps = {
  // Top-level categories, each with its subcategories (see buildCategoryTree).
  categories: CategoryTreeNode[]
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
  // Parent whose subcategories are shown; open the selected subcategory's parent.
  const [expandedId, setExpandedId] = useState<string | null>(
    () => categories.find(({ children }) => children.some((child) => child.id === selectedId))?.category.id ?? null,
  )

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
        {categories.map(({ category, children }) => {
          const Icon = getCategoryIcon(category.slug)
          const item = (
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
          if (children.length === 0) return item

          const expanded = expandedId === category.id
          const childrenId = `category-menu-${category.id}`
          return (
            <div className="navbar__explore-group" key={category.id}>
              <div className="navbar__explore-row">
                {item}
                <button
                  type="button"
                  role="menuitem"
                  className="navbar__explore-toggle"
                  aria-label={expanded ? 'Hide subcategories' : 'Show subcategories'}
                  aria-expanded={expanded}
                  aria-controls={childrenId}
                  onClick={() => setExpandedId(expanded ? null : category.id)}
                >
                  <span className="navbar__explore-chevron" aria-hidden="true">›</span>
                </button>
              </div>
              {expanded ? (
                <div
                  className="navbar__explore-children"
                  id={childrenId}
                  role="group"
                  aria-label={`${category.name} subcategories`}
                >
                  {children.map((child) => (
                    <button
                      type="button"
                      role="menuitem"
                      className={`navbar__explore-item navbar__explore-item--child${selectedId === child.id ? ' navbar__explore-item--active' : ''}`}
                      key={child.id}
                      onClick={() => onSelect(child.id)}
                    >
                      <span className="navbar__explore-label">{child.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
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
