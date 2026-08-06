import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { listPublicCategories } from '../../api/categoriesApi'
import { listPublicPlugins } from '../../api/pluginsApi'
import { listPublicProducts } from '../../api/productsApi'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import type { CategoryPublic } from '../../types/category'
import type { ProductLicenseType } from '../../types/product'
import { PluginCard } from '../Plugins/PluginCard'
import { ProductCard } from './ProductCard'

const PAGE_SIZE = 12
const HUB_PREVIEW_SIZE = 6

type SortOption = '-created_at' | 'price' | '-price' | 'name' | '-name'
type SearchEditSource = 'url' | 'input'

function scrollRail(rail: HTMLElement | null, direction: -1 | 1) {
  if (!rail) return
  const amount = Math.max(rail.clientWidth * 0.75, 280)
  rail.scrollBy({ left: direction * amount, behavior: 'smooth' })
}

function CategoryTile({
  category,
  onSelect,
}: {
  category: CategoryPublic
  onSelect: (id: string) => void
}) {
  const [imgError, setImgError] = useState(false)

  return (
    <button
      type="button"
      className="browse-category-card"
      onClick={() => onSelect(category.id)}
    >
      <div className="browse-category-card__media">
        {category.image && !imgError ? (
          <img
            src={category.image}
            alt=""
            className="browse-category-card__image"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="browse-category-card__placeholder" aria-hidden="true" />
        )}
      </div>
      <div className="browse-category-card__body">
        <span className="browse-category-card__name">{category.name}</span>
        {category.description ? (
          <span className="browse-category-card__description">{category.description}</span>
        ) : null}
      </div>
    </button>
  )
}

export function ProductsBrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const categoryFromUrl = searchParams.get('category')?.trim() ?? ''
  const searchFromUrl = searchParams.get('search')?.trim() ?? ''
  const viewAll = searchParams.get('view') === 'all'
  const isCatalogMode = Boolean(searchFromUrl || categoryFromUrl || viewAll)

  const [searchInput, setSearchInput] = useState(searchFromUrl)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(categoryFromUrl)
  const [selectedLicense, setSelectedLicense] = useState<string>('all')
  const [sortOrdering, setSortOrdering] = useState<SortOption>('-created_at')
  const [currentPage, setCurrentPage] = useState(1)
  const searchEditSourceRef = useRef<SearchEditSource>('url')

  const categoriesRailRef = useRef<HTMLDivElement>(null)
  const productsRailRef = useRef<HTMLDivElement>(null)
  const pluginsRailRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSelectedCategoryId(categoryFromUrl)
    setCurrentPage(1)
  }, [categoryFromUrl])

  useEffect(() => {
    searchEditSourceRef.current = 'url'
    setSearchInput(searchFromUrl)
    setCurrentPage(1)
  }, [searchFromUrl])

  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300)

  useEffect(() => {
    const current = searchParams.get('search')?.trim() ?? ''
    if (debouncedSearch === current || searchEditSourceRef.current !== 'input') {
      return
    }
    const nextParams = new URLSearchParams(searchParams)
    if (debouncedSearch) {
      nextParams.set('search', debouncedSearch.slice(0, 100))
    } else {
      nextParams.delete('search')
    }
    setSearchParams(nextParams, { replace: true })
  }, [debouncedSearch, searchParams, setSearchParams])

  const handleSearchChange = (val: string) => {
    searchEditSourceRef.current = 'input'
    setSearchInput(val.slice(0, 100))
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

  const handleLicenseChange = (license: string) => {
    setSelectedLicense(license)
    setCurrentPage(1)
  }

  const handleSortChange = (sort: SortOption) => {
    setSortOrdering(sort)
    setCurrentPage(1)
  }

  const openFullCatalog = () => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('view', 'all')
    setSearchParams(nextParams, { replace: true })
  }

  const exitCatalogMode = () => {
    searchEditSourceRef.current = 'input'
    setSearchInput('')
    setSelectedCategoryId('')
    setSelectedLicense('all')
    setSortOrdering('-created_at')
    setCurrentPage(1)
    setSearchParams({}, { replace: true })
  }

  const handleResetFilters = () => {
    searchEditSourceRef.current = 'input'
    setSearchInput('')
    setSelectedCategoryId('')
    setSelectedLicense('all')
    setSortOrdering('-created_at')
    setCurrentPage(1)

    const nextParams = new URLSearchParams()
    if (viewAll) {
      nextParams.set('view', 'all')
    }
    setSearchParams(nextParams, { replace: true })
  }

  const { data: categoriesData } = useQuery({
    queryKey: ['public-categories-list'],
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
      'public-products-browse',
      isCatalogMode ? currentPage : 1,
      isCatalogMode ? selectedCategoryId : '',
      isCatalogMode ? searchFromUrl : '',
      isCatalogMode ? sortOrdering : '-created_at',
      isCatalogMode ? 'catalog' : 'hub',
    ],
    queryFn: () =>
      listPublicProducts({
        page: isCatalogMode ? currentPage : 1,
        page_size: isCatalogMode ? PAGE_SIZE : HUB_PREVIEW_SIZE,
        category_id: isCatalogMode ? selectedCategoryId || undefined : undefined,
        search: isCatalogMode ? searchFromUrl || undefined : undefined,
        ordering: isCatalogMode ? sortOrdering : '-created_at',
      }),
    placeholderData: keepPreviousData,
  })

  const {
    data: pluginsData,
    isLoading: pluginsLoading,
    isError: pluginsError,
  } = useQuery({
    queryKey: ['public-plugins-hub-preview'],
    queryFn: () =>
      listPublicPlugins({
        page: 1,
        page_size: HUB_PREVIEW_SIZE,
        ordering: '-created_at',
      }),
    staleTime: 1000 * 60 * 5,
    enabled: !isCatalogMode,
  })

  const filteredProducts = useMemo(() => {
    if (!productsData?.results) return []
    if (!isCatalogMode || selectedLicense === 'all') return productsData.results

    return productsData.results.filter(
      (product) => product.license_type === (selectedLicense as ProductLicenseType),
    )
  }, [productsData, selectedLicense, isCatalogMode])

  const totalPages = Math.ceil((productsData?.count ?? 0) / PAGE_SIZE)
  const isFiltered =
    Boolean(searchInput) ||
    Boolean(selectedCategoryId) ||
    selectedLicense !== 'all' ||
    sortOrdering !== '-created_at'

  const categories = categoriesData?.results ?? []
  const plugins = pluginsData?.results ?? []

  const searchBar = (includeCategory: boolean) => (
    <div className="browse-search-bar">
      {includeCategory ? (
        <label className="browse-search-bar__category-label" htmlFor="browse-category-select">
          <span className="visually-hidden">Category</span>
          <select
            id="browse-category-select"
            value={selectedCategoryId}
            onChange={(e) => handleCategoryChange(e.target.value)}
            className="browse-search-bar__category"
            aria-label="Category"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <Input
        type="search"
        placeholder="Search 3D models, plugins..."
        value={searchInput}
        onChange={(e) => handleSearchChange(e.target.value)}
        className="browse-search-bar__input"
        aria-label="Search 3D models"
      />
    </div>
  )

  if (!isCatalogMode) {
    return (
      <main className="products-browse-page products-browse-page--hub">
        <div className="browse-hub__toolbar">{searchBar(true)}</div>

        <section className="browse-hub-hero" aria-labelledby="browse-hub-heading">
          <h1 id="browse-hub-heading" className="browse-hub-hero__title">
            The Ultimate Marketplace for 3D &amp; Digital Assets
          </h1>
          <p className="browse-hub-hero__subtitle">
            Discover, create and bring ideas to life with high-quality 3D models, materials,
            textures and tools — all in one place.
          </p>
        </section>

        <section className="browse-module-cards" aria-label="Marketplace modules">
          <article className="browse-module-card">
            <div className="browse-module-card__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <h2 className="browse-module-card__title">3D Models</h2>
            <p className="browse-module-card__text">
              Explore high quality 3D models in all categories.
            </p>
            <Button type="button" onClick={openFullCatalog}>
              Shop 3D models
            </Button>
          </article>

          <article className="browse-module-card">
            <div className="browse-module-card__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M14 7V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v2" />
                <rect x="3" y="7" width="18" height="13" rx="2" />
                <path d="M12 12v4" />
                <path d="M9 14h6" />
              </svg>
            </div>
            <h2 className="browse-module-card__title">Plugins</h2>
            <p className="browse-module-card__text">
              Power up your workflow with professional plugins and tools.
            </p>
            <Link className="browse-module-card__cta" to="/plugins">
              Explore Plugins
            </Link>
          </article>

          <article className="browse-module-card">
            <div className="browse-module-card__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <h2 className="browse-module-card__title">Inquiry Portal</h2>
            <p className="browse-module-card__text">
              Have a specific requirement? Our team is here to help.
            </p>
            <Link className="browse-module-card__cta" to="/custom-projects">
              Submit an Inquiry
            </Link>
          </article>
        </section>

        <section className="browse-rail-section" aria-labelledby="trending-categories-heading">
          <div className="browse-rail-section__header">
            <h2 id="trending-categories-heading" className="browse-rail-section__title">
              Trending Categories
            </h2>
            <div className="browse-rail-section__actions">
              <button
                type="button"
                className="browse-rail-section__view-all"
                onClick={openFullCatalog}
              >
                View All
              </button>
              <div className="browse-rail-section__nav">
                <button
                  type="button"
                  className="browse-rail-nav"
                  aria-label="Previous categories"
                  onClick={() => scrollRail(categoriesRailRef.current, -1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="browse-rail-nav"
                  aria-label="Next categories"
                  onClick={() => scrollRail(categoriesRailRef.current, 1)}
                >
                  ›
                </button>
              </div>
            </div>
          </div>
          <div className="browse-rail" ref={categoriesRailRef}>
            {categories.length === 0 ? (
              <p className="browse-rail__empty">Categories will appear here as the catalog grows.</p>
            ) : (
              categories.map((category) => (
                <CategoryTile
                  key={category.id}
                  category={category}
                  onSelect={handleCategoryChange}
                />
              ))
            )}
          </div>
        </section>

        <section className="browse-rail-section" aria-labelledby="shop-models-heading">
          <div className="browse-rail-section__header">
            <h2 id="shop-models-heading" className="browse-rail-section__title">
              Shop 3D Models
            </h2>
            <div className="browse-rail-section__actions">
              <button
                type="button"
                className="browse-rail-section__view-all"
                onClick={openFullCatalog}
              >
                View All
              </button>
              <div className="browse-rail-section__nav">
                <button
                  type="button"
                  className="browse-rail-nav"
                  aria-label="Previous models"
                  onClick={() => scrollRail(productsRailRef.current, -1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="browse-rail-nav"
                  aria-label="Next models"
                  onClick={() => scrollRail(productsRailRef.current, 1)}
                >
                  ›
                </button>
              </div>
            </div>
          </div>
          {isLoading ? (
            <div className="browse-rail browse-rail--cards" aria-label="Loading products">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="product-card-skeleton browse-rail__item">
                  <div className="product-card-skeleton__media" />
                  <div className="product-card-skeleton__body">
                    <div className="product-card-skeleton__line product-card-skeleton__line--short" />
                    <div className="product-card-skeleton__line" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="products-error-state">
              <h3>Failed to load products</h3>
              <p>We encountered an issue fetching models from the marketplace catalog.</p>
              <Button variant="secondary" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <p className="browse-rail__empty">No 3D models are available yet.</p>
          ) : (
            <div className="browse-rail browse-rail--cards" ref={productsRailRef}>
              {filteredProducts.map((product) => (
                <div key={product.id} className="browse-rail__item">
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="browse-rail-section" aria-labelledby="explore-plugins-heading">
          <div className="browse-rail-section__header">
            <h2 id="explore-plugins-heading" className="browse-rail-section__title">
              Explore Plugins
            </h2>
            <div className="browse-rail-section__actions">
              <Link className="browse-rail-section__view-all" to="/plugins">
                View All
              </Link>
              <div className="browse-rail-section__nav">
                <button
                  type="button"
                  className="browse-rail-nav"
                  aria-label="Previous plugins"
                  onClick={() => scrollRail(pluginsRailRef.current, -1)}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="browse-rail-nav"
                  aria-label="Next plugins"
                  onClick={() => scrollRail(pluginsRailRef.current, 1)}
                >
                  ›
                </button>
              </div>
            </div>
          </div>
          {pluginsLoading ? (
            <div className="browse-rail browse-rail--cards" aria-label="Loading plugins">
              {Array.from({ length: 3 }).map((_, idx) => (
                <div key={idx} className="product-card-skeleton browse-rail__item">
                  <div className="product-card-skeleton__media" />
                  <div className="product-card-skeleton__body">
                    <div className="product-card-skeleton__line product-card-skeleton__line--short" />
                    <div className="product-card-skeleton__line" />
                  </div>
                </div>
              ))}
            </div>
          ) : pluginsError ? (
            <p className="browse-rail__empty">Plugins could not be loaded right now.</p>
          ) : plugins.length === 0 ? (
            <p className="browse-rail__empty">No plugins are available yet.</p>
          ) : (
            <div className="browse-rail browse-rail--cards" ref={pluginsRailRef}>
              {plugins.map((plugin) => (
                <div key={plugin.id} className="browse-rail__item">
                  <PluginCard plugin={plugin} />
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    )
  }

  return (
    <main className="products-browse-page">
      <section className="products-browse-hero">
        <div className="products-browse-hero__container">
          <button type="button" className="products-browse-hero__back" onClick={exitCatalogMode}>
            ← Back to browse
          </button>
          <h1 className="products-browse-hero__title">Explore Premium 3D Models</h1>
          <p className="products-browse-hero__subtitle">
            High-fidelity 3D assets crafted for game design, architecture, rendering, and visual
            effects.
          </p>
          {searchBar(false)}
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
            <label htmlFor="category-select" className="products-filter-group__label">
              Category
            </label>
            <select
              id="category-select"
              value={selectedCategoryId}
              onChange={(e) => handleCategoryChange(e.target.value)}
              className="products-filter-group__select"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="products-filter-group">
            <label htmlFor="license-select" className="products-filter-group__label">
              License Type
            </label>
            <select
              id="license-select"
              value={selectedLicense}
              onChange={(e) => handleLicenseChange(e.target.value)}
              className="products-filter-group__select"
            >
              <option value="all">All Licenses</option>
              <option value="standard">Standard License</option>
              <option value="extended">Extended License</option>
              <option value="editorial">Editorial License</option>
            </select>
          </div>

          <div className="products-filter-group">
            <label htmlFor="sort-select" className="products-filter-group__label">
              Sort By
            </label>
            <select
              id="sort-select"
              value={sortOrdering}
              onChange={(e) => handleSortChange(e.target.value as SortOption)}
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
                'Loading assets...'
              ) : (
                <>
                  Showing <strong>{filteredProducts.length}</strong> of{' '}
                  <strong>{productsData?.count ?? 0}</strong> products
                </>
              )}
            </p>
          </div>

          {isLoading ? (
            <div className="products-grid products-grid--skeleton" aria-label="Loading products">
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
              <h3>Failed to load products</h3>
              <p>We encountered an issue fetching models from the marketplace catalog.</p>
              <Button variant="secondary" onClick={() => refetch()}>
                Try Again
              </Button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="products-empty-state">
              <div className="products-empty-state__icon" aria-hidden="true">
                🔍
              </div>
              <h3>No 3D Models Found</h3>
              <p>
                Try adjusting your search query, clearing filters, or choosing a different category.
              </p>
              {isFiltered && (
                <Button variant="secondary" onClick={handleResetFilters}>
                  Clear All Filters
                </Button>
              )}
            </div>
          ) : (
            <>
              <div className="products-grid">
                {filteredProducts.map((product) => (
                  <ProductCard key={product.id} product={product} />
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
