import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listPublicCategories } from '../../api/categoriesApi'
import { listPublicProducts } from '../../api/productsApi'
import { Button } from '../../components/ui/Button'
import { SiteHeroImage } from '../../components/SiteHeroImage'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { ProductCard } from '../Products/ProductCard'

const PAGE_SIZE = 12

const SOFTWARE_CHIPS = ['Blender', 'Maya', '3ds Max', 'Cinema 4D'] as const

type TraitKey = 'rigged' | 'animated' | 'pbr_ready' | 'game_ready'

const TRAIT_CHIPS: { key: TraitKey; label: string }[] = [
  { key: 'rigged', label: 'Rigged' },
  { key: 'animated', label: 'Animated' },
  { key: 'pbr_ready', label: 'PBR' },
  { key: 'game_ready', label: 'Game-ready' },
]

type ViewMode = 'grid' | 'list'
const SORT_OPTIONS = [
  '-created_at',
  'price',
  '-price',
  'name',
  '-name',
  '-total_downloads',
  '-review_count',
] as const
type SortOption = (typeof SORT_OPTIONS)[number]

function readSortFromUrl(raw: string): SortOption {
  return (SORT_OPTIONS as readonly string[]).includes(raw) ? (raw as SortOption) : '-created_at'
}

function readTraitFromUrl(searchParams: URLSearchParams, key: TraitKey): boolean {
  const raw = searchParams.get(key)?.trim().toLowerCase() ?? ''
  return raw === '1' || raw === 'true' || raw === 'yes'
}

export function ModelsBrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const categoryFromUrl = searchParams.get('category')?.trim() ?? ''
  const searchFromUrl = searchParams.get('search')?.trim() ?? ''
  const sortFromUrl = readSortFromUrl(searchParams.get('ordering')?.trim() ?? '')

  const riggedFromUrl = readTraitFromUrl(searchParams, 'rigged')
  const animatedFromUrl = readTraitFromUrl(searchParams, 'animated')
  const pbrReadyFromUrl = readTraitFromUrl(searchParams, 'pbr_ready')
  const gameReadyFromUrl = readTraitFromUrl(searchParams, 'game_ready')

  const [searchInput, setSearchInput] = useState(searchFromUrl)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(categoryFromUrl)
  const [sortOrdering, setSortOrdering] = useState<SortOption>(sortFromUrl)
  const [currentPage, setCurrentPage] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [traits, setTraits] = useState<Record<TraitKey, boolean>>({
    rigged: riggedFromUrl,
    animated: animatedFromUrl,
    pbr_ready: pbrReadyFromUrl,
    game_ready: gameReadyFromUrl,
  })

  useEffect(() => {
    setSelectedCategoryId(categoryFromUrl)
    setCurrentPage(1)
  }, [categoryFromUrl])

  useEffect(() => {
    setSearchInput(searchFromUrl)
    setCurrentPage(1)
  }, [searchFromUrl])

  useEffect(() => {
    setSortOrdering(sortFromUrl)
    setCurrentPage(1)
  }, [sortFromUrl])

  useEffect(() => {
    setTraits({
      rigged: riggedFromUrl,
      animated: animatedFromUrl,
      pbr_ready: pbrReadyFromUrl,
      game_ready: gameReadyFromUrl,
    })
    setCurrentPage(1)
  }, [riggedFromUrl, animatedFromUrl, pbrReadyFromUrl, gameReadyFromUrl])

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

  const handleSortChange = (sort: SortOption) => {
    setSortOrdering(sort)
    setCurrentPage(1)

    const nextParams = new URLSearchParams(searchParams)
    if (sort === '-created_at') {
      nextParams.delete('ordering')
    } else {
      nextParams.set('ordering', sort)
    }
    setSearchParams(nextParams, { replace: true })
  }

  const handleSoftwareChip = (term: string) => {
    setSearchInput(term)
    setCurrentPage(1)
    setSearchInUrl(term)
  }

  const handleTraitToggle = (key: TraitKey) => {
    const nextValue = !traits[key]
    setTraits((prev) => ({ ...prev, [key]: nextValue }))
    setCurrentPage(1)

    const nextParams = new URLSearchParams(searchParams)
    if (nextValue) {
      nextParams.set(key, '1')
    } else {
      nextParams.delete(key)
    }
    setSearchParams(nextParams, { replace: true })
  }

  const handleResetFilters = () => {
    setSearchInput('')
    setSelectedCategoryId('')
    setSortOrdering('-created_at')
    setCurrentPage(1)
    setTraits({
      rigged: false,
      animated: false,
      pbr_ready: false,
      game_ready: false,
    })

    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('category')
    nextParams.delete('search')
    nextParams.delete('rigged')
    nextParams.delete('animated')
    nextParams.delete('pbr_ready')
    nextParams.delete('game_ready')
    nextParams.delete('ordering')
    setSearchParams(nextParams, { replace: true })
  }

  const { data: categoriesData } = useQuery({
    queryKey: ['public-categories-list', { page_size: 100 }],
    queryFn: () => listPublicCategories({ page_size: 100 }),
    staleTime: 1000 * 60 * 5,
  })

  const {
    data: productsData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: [
      'public-models-browse',
      currentPage,
      selectedCategoryId,
      debouncedSearch,
      sortOrdering,
      traits.rigged,
      traits.animated,
      traits.pbr_ready,
      traits.game_ready,
    ],
    queryFn: () =>
      listPublicProducts({
        page: currentPage,
        page_size: PAGE_SIZE,
        category_id: selectedCategoryId || undefined,
        search: debouncedSearch || undefined,
        ordering: sortOrdering,
        rigged: traits.rigged || undefined,
        animated: traits.animated || undefined,
        pbr_ready: traits.pbr_ready || undefined,
        game_ready: traits.game_ready || undefined,
      }),
    placeholderData: keepPreviousData,
  })

  const products = productsData?.results ?? []
  const totalCount = productsData?.count ?? 0
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const hasActiveTrait = Object.values(traits).some(Boolean)
  const isFiltered =
    Boolean(searchInput) ||
    Boolean(selectedCategoryId) ||
    sortOrdering !== '-created_at' ||
    hasActiveTrait

  const selectedCategoryName = useMemo(() => {
    if (!selectedCategoryId) return null
    return categoriesData?.results.find((cat) => cat.id === selectedCategoryId)?.name ?? null
  }, [categoriesData?.results, selectedCategoryId])

  const heroTitle = selectedCategoryName ?? '3D Model'

  return (
    <main className="plugins-browse models-browse">
      <section className="plugins-browse-hero site-hero-banner">
        <SiteHeroImage />
        <div className="site-hero-banner__overlay" />
        <div className="plugins-browse-hero__container">
          <h1 className="plugins-browse-hero__title">{heroTitle}</h1>

          <p className="plugins-browse-hero__subtitle">
            Premium 3D models for games, film, architecture, and product design. Browse
            production-ready assets built for Blender, Maya, 3ds Max, and Cinema 4D.
          </p>
        </div>
      </section>

      <div className="plugins-browse__body">
        <aside className="plugins-filters" aria-label="3D model filters">
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
            <label htmlFor="model-category-select" className="plugins-filters__label">
              Category
            </label>
            <select
              id="model-category-select"
              value={selectedCategoryId}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="plugins-filters__select"
            >
              <option value="">All Categories</option>
              {categoriesData?.results.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="plugins-filters__group">
            <p className="plugins-filters__label" id="model-software-label">
              Software
            </p>
            <div
              className="plugins-filters__chips"
              role="group"
              aria-labelledby="model-software-label"
            >
              {SOFTWARE_CHIPS.map((term) => {
                const active = searchInput.trim().toLowerCase() === term.toLowerCase()
                return (
                  <button
                    key={term}
                    type="button"
                    className={`plugins-filters__chip${active ? ' plugins-filters__chip--active' : ''}`}
                    onClick={() => handleSoftwareChip(term)}
                    aria-pressed={active}
                  >
                    {term}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="plugins-filters__group">
            <p className="plugins-filters__label" id="model-traits-label">
              Features
            </p>
            <div
              className="plugins-filters__chips"
              role="group"
              aria-labelledby="model-traits-label"
            >
              {TRAIT_CHIPS.map(({ key, label }) => {
                const active = traits[key]
                return (
                  <button
                    key={key}
                    type="button"
                    className={`plugins-filters__chip${active ? ' plugins-filters__chip--active' : ''}`}
                    onClick={() => handleTraitToggle(key)}
                    aria-pressed={active}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
        </aside>

        <section className="plugins-browse-main">
          <div className="plugins-browse-toolbar">
            <p className="plugins-browse-toolbar__count" aria-live="polite">
              {isLoading
                ? 'Loading models…'
                : `${totalCount} Model${totalCount === 1 ? '' : 's'} found`}
            </p>
            <div className="plugins-browse-toolbar__controls">
              <label className="plugins-browse-toolbar__sort" htmlFor="model-sort-select">
                <span>Sort by:</span>
                <select
                  id="model-sort-select"
                  value={sortOrdering}
                  onChange={(e) => handleSortChange(readSortFromUrl(e.target.value))}
                  className="plugins-filters__select plugins-filters__select--compact"
                >
                  <option value="-created_at">Newest First</option>
                  <option value="-total_downloads">Top Selling</option>
                  <option value="-review_count">Trending</option>
                  <option value="price">Price: Low to High</option>
                  <option value="-price">Price: High to Low</option>
                  <option value="name">Name: A to Z</option>
                  <option value="-name">Name: Z to A</option>
                </select>
              </label>

              <div className="plugins-browse-view" role="group" aria-label="View mode">
                <button
                  type="button"
                  className={`plugins-browse-view__btn${viewMode === 'grid' ? ' plugins-browse-view__btn--active' : ''}`}
                  onClick={() => setViewMode('grid')}
                  aria-pressed={viewMode === 'grid'}
                  aria-label="Grid view"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <rect x="1" y="1" width="6" height="6" rx="1" fill="currentColor" />
                    <rect x="9" y="1" width="6" height="6" rx="1" fill="currentColor" />
                    <rect x="1" y="9" width="6" height="6" rx="1" fill="currentColor" />
                    <rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`plugins-browse-view__btn${viewMode === 'list' ? ' plugins-browse-view__btn--active' : ''}`}
                  onClick={() => setViewMode('list')}
                  aria-pressed={viewMode === 'list'}
                  aria-label="List view"
                >
                  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <rect x="1" y="2" width="14" height="2.5" rx="0.5" fill="currentColor" />
                    <rect x="1" y="6.75" width="14" height="2.5" rx="0.5" fill="currentColor" />
                    <rect x="1" y="11.5" width="14" height="2.5" rx="0.5" fill="currentColor" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div
              className={`plugins-grid${viewMode === 'list' ? ' plugins-grid--list' : ''}`}
              aria-label="Loading 3D models"
            >
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
              <h3>Failed to load 3D models</h3>
              <p>We encountered an issue fetching models from the store.</p>
              <Button variant="secondary" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : products.length === 0 ? (
            <div className="plugins-browse-state">
              <h3>No 3D Models Found</h3>
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
              <div
                className={`plugins-grid${viewMode === 'list' ? ' plugins-grid--list' : ''}`}
              >
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
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
