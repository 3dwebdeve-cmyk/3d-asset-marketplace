import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listPublicPluginCategories, listPublicPlugins } from '../../api/pluginsApi'
import { Button } from '../../components/ui/Button'
import { Pagination } from '../../components/ui/Pagination'
import { PLUGINS_HERO_IMAGE_SRC, SiteHeroImage } from '../../components/SiteHeroImage'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import type { PluginOrdering } from '../../types/plugin'
import { PluginCard } from './PluginCard'
import '../../styles/plugins-browse.css'
import '../../styles/products-browse.css'
import '../../styles/products-browse.css'

const PAGE_SIZE = 12

const COMPAT_CHIPS = ['Blender', 'Maya', '3ds Max', 'Cinema 4D'] as const

export function PluginsBrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const categoryFromUrl = searchParams.get('category')?.trim() ?? ''
  const searchFromUrl = searchParams.get('search')?.trim() ?? ''

  const [searchInput, setSearchInput] = useState(searchFromUrl)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(categoryFromUrl)
  const [sortOrdering, setSortOrdering] = useState<PluginOrdering>('-created_at')
  const [currentPage, setCurrentPage] = useState(1)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)
  const categoryDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!categoryDropdownOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (!categoryDropdownRef.current?.contains(event.target as Node)) {
        setCategoryDropdownOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCategoryDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [categoryDropdownOpen])

  useEffect(() => {
    setSelectedCategoryId(categoryFromUrl)
    setCurrentPage(1)
  }, [categoryFromUrl])

  useEffect(() => {
    setSearchInput(searchFromUrl)
    setCurrentPage(1)
  }, [searchFromUrl])

  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300)

  const setSearchInUrl = (value: string) => {
    const nextParams = new URLSearchParams(searchParams)
    const trimmed = value.trim().slice(0, 100)
    if (trimmed) {
      nextParams.set('search', trimmed)
    } else {
      nextParams.delete('search')
    }
    setSearchParams(nextParams, { replace: true })
  }

  const handleSortChange = (sort: PluginOrdering) => {
    setSortOrdering(sort)
    setCurrentPage(1)
  }

  const handleCompatChip = (term: string) => {
    setSearchInput(term)
    setCurrentPage(1)
    setSearchInUrl(term)
  }

  const handleResetFilters = () => {
    setSearchInput('')
    setSelectedCategoryId('')
    setSortOrdering('-created_at')
    setCurrentPage(1)

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('category')
    nextParams.delete('search')
    setSearchParams(nextParams, { replace: true })
  }

  const { data: categoriesData } = useQuery({
    queryKey: ['public-plugin-categories-list', { page_size: 100, is_active: true }],
    queryFn: () => listPublicPluginCategories({ page_size: 100, is_active: true }),
    staleTime: 1000 * 60 * 5,
  })

  const {
    data: pluginsData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: [
      'public-plugins-browse',
      currentPage,
      selectedCategoryId,
      debouncedSearch,
      sortOrdering,
    ],
    queryFn: () =>
      listPublicPlugins({
        page: currentPage,
        page_size: PAGE_SIZE,
        category_id: selectedCategoryId || undefined,
        search: debouncedSearch || undefined,
        ordering: sortOrdering,
      }),
    placeholderData: keepPreviousData,
  })

  const plugins = pluginsData?.results ?? []
  const totalCount = pluginsData?.count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const isFiltered =
    Boolean(searchInput) || Boolean(selectedCategoryId) || sortOrdering !== '-created_at'

  const selectedCategoryName = useMemo(() => {
    if (!selectedCategoryId) return null
    return categoriesData?.results.find((cat) => cat.id === selectedCategoryId)?.name ?? null
  }, [categoriesData?.results, selectedCategoryId])

  const heroTitle = selectedCategoryName ?? 'Plugins'

  return (
    <main className="plugins-browse">
      <section className="plugins-browse-hero site-hero-banner">
        <SiteHeroImage src={PLUGINS_HERO_IMAGE_SRC} width={4224} height={992} />
        <div className="site-hero-banner__overlay" />
        <div className="plugins-browse-hero__container">
          <h1 className="plugins-browse-hero__title">{heroTitle}</h1>

          <p className="plugins-browse-hero__subtitle">
            Professional plugins for Blender, Maya, Cinema 4D, and more. Supercharge your 3D
            workflow with tools built by industry experts.
          </p>
        </div>
      </section>

      <div className="plugins-browse__body">
        <aside
          className={`plugins-filters${filtersOpen ? ' plugins-filters--open' : ''}`}
          aria-label="Plugin filters"
        >
          <div className="plugins-filters__header">
            <button
              type="button"
              className="plugins-filters__toggle"
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <h2 className="plugins-filters__title">FILTERS</h2>
              <span className="plugins-filters__toggle-icon" aria-hidden="true">
                {filtersOpen ? '−' : '+'}
              </span>
            </button>
            {isFiltered ? (
              <button
                type="button"
                className="plugins-filters__reset"
                onClick={handleResetFilters}
              >
                Clear Filters
              </button>
            ) : null}
          </div>

          <div className="plugins-filters__panel">
          <div className="plugins-filters__group" ref={categoryDropdownRef}>
            <label className="plugins-filters__label" htmlFor="plugin-category">
              Category
            </label>
            <div className="custom-select-dropdown">
              <button
                type="button"
                id="plugin-category-trigger"
                className={`custom-select-trigger${categoryDropdownOpen ? ' custom-select-trigger--open' : ''}`}
                aria-expanded={categoryDropdownOpen}
                aria-haspopup="listbox"
                onClick={() => setCategoryDropdownOpen((open) => !open)}
              >
                <span className="custom-select-label">
                  {selectedCategoryName ?? 'All categories'}
                </span>
                <svg
                  className={`custom-select-arrow${categoryDropdownOpen ? ' custom-select-arrow--open' : ''}`}
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {categoryDropdownOpen ? (
                <ul className="custom-select-menu" role="listbox" aria-label="Select Category">
                  <li
                    role="option"
                    aria-selected={selectedCategoryId === ''}
                    className={`custom-select-option${selectedCategoryId === '' ? ' custom-select-option--active' : ''}`}
                    onClick={() => {
                      setSelectedCategoryId('')
                      setCurrentPage(1)
                      setCategoryDropdownOpen(false)
                      const nextParams = new URLSearchParams(searchParams)
                      nextParams.delete('category')
                      setSearchParams(nextParams, { replace: true })
                    }}
                  >
                    All categories
                  </li>
                  {(categoriesData?.results ?? []).map((category) => (
                    <li
                      key={category.id}
                      role="option"
                      aria-selected={selectedCategoryId === category.id}
                      className={`custom-select-option${selectedCategoryId === category.id ? ' custom-select-option--active' : ''}`}
                      onClick={() => {
                        setSelectedCategoryId(category.id)
                        setCurrentPage(1)
                        setCategoryDropdownOpen(false)
                        const nextParams = new URLSearchParams(searchParams)
                        nextParams.set('category', category.id)
                        setSearchParams(nextParams, { replace: true })
                      }}
                    >
                      {category.name}
                    </li>
                  ))}
                </ul>
              ) : null}

              <select
                id="plugin-category"
                aria-label="Category"
                value={selectedCategoryId}
                onChange={(event) => {
                  const value = event.target.value
                  setSelectedCategoryId(value)
                  setCurrentPage(1)

                  const nextParams = new URLSearchParams(searchParams)
                  if (value) nextParams.set('category', value)
                  else nextParams.delete('category')

                  setSearchParams(nextParams, { replace: true })
                }}
                className="custom-select-native"
                tabIndex={-1}
                aria-hidden="true"
              >
                <option value="">All categories</option>
                {(categoriesData?.results ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="plugins-filters__group">
            <p className="plugins-filters__label" id="plugin-compat-label">
              Compatibility
            </p>
            <div
              className="plugins-filters__chips"
              role="group"
              aria-labelledby="plugin-compat-label"
            >
              {COMPAT_CHIPS.map((term) => {
                const active = searchInput.trim().toLowerCase() === term.toLowerCase()
                return (
                  <button
                    key={term}
                    type="button"
                    className={`plugins-filters__chip${active ? ' plugins-filters__chip--active' : ''}`}
                    onClick={() => handleCompatChip(term)}
                    aria-pressed={active}
                  >
                    {term}
                  </button>
                )
              })}
            </div>
          </div>
          </div>
        </aside>

        <section className="plugins-browse-main">
          <div className="plugins-browse-toolbar">
            <div className="plugins-browse-toolbar__controls">
              <label className="plugins-browse-toolbar__sort" htmlFor="plugin-sort-select">
                <span>Sort by:</span>
                <select
                  id="plugin-sort-select"
                  value={sortOrdering}
                  onChange={(e) => handleSortChange(e.target.value as PluginOrdering)}
                  className="plugins-filters__select plugins-filters__select--compact"
                >
                  <option value="-created_at">Newest First</option>
                  <option value="price">Price: Low to High</option>
                  <option value="-price">Price: High to Low</option>
                  <option value="name">Name: A to Z</option>
                  <option value="-name">Name: Z to A</option>
                </select>
              </label>
            </div>
          </div>

          {isLoading ? (
            <div className="plugins-grid" aria-label="Loading plugins">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="product-card-skeleton">
                  <div className="product-card-skeleton__media" />
                  <div className="product-card-skeleton__body">
                    <div className="product-card-skeleton__line product-card-skeleton__line--short" />
                    <div className="product-card-skeleton__line" />
                    <div className="product-card-skeleton__line product-card-skeleton__line--medium" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="plugins-browse-state">
              <h3>Failed to load plugins</h3>
              <p>We encountered an issue fetching plugins from the store.</p>
              <Button variant="secondary" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : plugins.length === 0 ? (
            <div className="plugins-browse-state">
              <h3>No Plugins Found</h3>
              <p>
                Try adjusting your search query, clearing filters, or choosing a different
                category.
              </p>
              {isFiltered ? (
                <Button variant="secondary" onClick={handleResetFilters}>
                  Clear Filters
                </Button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="plugins-grid">
                {plugins.map((plugin) => (
                  <PluginCard key={plugin.id} plugin={plugin} />
                ))}
              </div>

              <Pagination
                page={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
            </>
          )}
        </section>
      </div>
    </main>
  )
}
