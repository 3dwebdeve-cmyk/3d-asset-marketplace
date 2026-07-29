import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listPublicPluginCategories, listPublicPlugins } from '../../api/pluginsApi'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import type { PluginOrdering } from '../../types/plugin'
import { PluginCard } from './PluginCard'

const PAGE_SIZE = 12

export function PluginsBrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const categoryFromUrl = searchParams.get('category')?.trim() ?? ''

  const [searchInput, setSearchInput] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(categoryFromUrl)
  const [sortOrdering, setSortOrdering] = useState<PluginOrdering>('-created_at')
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    setSelectedCategoryId(categoryFromUrl)
    setCurrentPage(1)
  }, [categoryFromUrl])

  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300)

  const handleSearchChange = (val: string) => {
    setSearchInput(val)
    setCurrentPage(1)
  }

  const handleCategoryChange = (catId: string) => {
    setSelectedCategoryId(catId)
    setCurrentPage(1)

    const nextParams = new URLSearchParams(searchParams)
    if (catId) {
      nextParams.set('category', catId)
    } else {
      nextParams.delete('category')
    }
    setSearchParams(nextParams, { replace: true })
  }

  const handleSortChange = (sort: PluginOrdering) => {
    setSortOrdering(sort)
    setCurrentPage(1)
  }

  const handleResetFilters = () => {
    setSearchInput('')
    setSelectedCategoryId('')
    setSortOrdering('-created_at')
    setCurrentPage(1)

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('category')
    setSearchParams(nextParams, { replace: true })
  }

  const { data: categoriesData } = useQuery({
    queryKey: ['public-plugin-categories-list'],
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
  })

  const plugins = pluginsData?.results ?? []
  const totalPages = Math.ceil((pluginsData?.count ?? 0) / PAGE_SIZE)
  const isFiltered =
    Boolean(searchInput) || Boolean(selectedCategoryId) || sortOrdering !== '-created_at'

  return (
    <main className="products-browse-page">
      <section className="products-browse-hero">
        <div className="products-browse-hero__container">
          <span className="products-browse-hero__badge">Plugin Store</span>
          <h1 className="products-browse-hero__title">Discover 3D Software Plugins</h1>
          <p className="products-browse-hero__subtitle">
            Professional plugins for Blender, Maya, Cinema 4D, and more. Supercharge your 3D
            workflow with tools built by industry experts.
          </p>

          <div className="products-browse-search">
            <Input
              type="search"
              placeholder="Search plugins by name or keyword..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="products-browse-search__input"
              aria-label="Search plugins"
            />
          </div>
        </div>
      </section>

      <div className="products-browse-content">
        <aside className="products-browse-sidebar">
          <div className="products-browse-sidebar__header">
            <h2 className="products-browse-sidebar__title">Filters</h2>
            {isFiltered && (
              <button
                type="button"
                className="products-browse-sidebar__reset"
                onClick={handleResetFilters}
              >
                Reset All
              </button>
            )}
          </div>

          <div className="products-filter-group">
            <label htmlFor="plugin-category-select" className="products-filter-group__label">
              Category
            </label>
            <select
              id="plugin-category-select"
              value={selectedCategoryId}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="products-filter-group__select"
            >
              <option value="">All Categories</option>
              {categoriesData?.results.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="products-filter-group">
            <label htmlFor="plugin-sort-select" className="products-filter-group__label">
              Sort By
            </label>
            <select
              id="plugin-sort-select"
              value={sortOrdering}
              onChange={(e) => handleSortChange(e.target.value as PluginOrdering)}
              className="products-filter-group__select"
            >
              <option value="-created_at">Newest First</option>
              <option value="price">Price: Low to High</option>
              <option value="-price">Price: High to Low</option>
              <option value="name">Name: A to Z</option>
              <option value="-name">Name: Z to A</option>
            </select>
          </div>
        </aside>

        <section className="products-browse-main">
          <div className="products-browse-toolbar">
            <p className="products-browse-toolbar__count">
              {isLoading ? (
                'Loading plugins...'
              ) : (
                <>
                  Showing <strong>{plugins.length}</strong> of{' '}
                  <strong>{pluginsData?.count ?? 0}</strong> plugins
                </>
              )}
            </p>
          </div>

          {isLoading ? (
            <div className="products-grid products-grid--skeleton" aria-label="Loading plugins">
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
            <div className="products-error-state">
              <h3>Failed to load plugins</h3>
              <p>We encountered an issue fetching plugins from the store.</p>
              <Button variant="secondary" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : plugins.length === 0 ? (
            <div className="products-empty-state">
              <div className="products-empty-state__icon" aria-hidden="true">
                🔍
              </div>
              <h3>No Plugins Found</h3>
              <p>
                Try adjusting your search query, clearing filters, or choosing a different
                category.
              </p>
              {isFiltered && (
                <Button variant="secondary" onClick={handleResetFilters}>
                  Clear Filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="products-grid">
                {plugins.map((plugin) => (
                  <PluginCard key={plugin.id} plugin={plugin} />
                ))}
              </div>

              {totalPages > 1 && (
                <nav className="products-pagination" aria-label="Pagination Navigation">
                  <Button
                    variant="secondary"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="products-pagination__info">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </nav>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  )
}
