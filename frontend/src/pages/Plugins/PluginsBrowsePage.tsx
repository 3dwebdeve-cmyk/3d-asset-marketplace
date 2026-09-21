import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listPublicPluginCategories, listPublicPlugins } from '../../api/pluginsApi'
import { Button } from '../../components/ui/Button'
import { PLUGINS_HERO_IMAGE_SRC, SiteHeroImage } from '../../components/SiteHeroImage'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import type { PluginOrdering } from '../../types/plugin'
import { PluginCard } from './PluginCard'

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
        <aside className="plugins-filters" aria-label="Plugin filters">
          <div className="plugins-filters__header">
            <h2 className="plugins-filters__title">FILTERS</h2>
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

              {totalPages > 1 ? (
                <nav className="plugins-pagination" aria-label="Pagination Navigation">
                  <Button
                    variant="secondary"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="plugins-pagination__info">
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
              ) : null}
            </>
          )}
        </section>
      </div>
    </main>
  )
}
