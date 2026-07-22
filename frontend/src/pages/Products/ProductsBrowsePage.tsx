import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { listPublicCategories } from '../../api/categoriesApi'
import { listPublicProducts } from '../../api/productsApi'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import type { ProductLicenseType } from '../../types/product'
import { ProductCard } from './ProductCard'

const PAGE_SIZE = 12

type SortOption = '-created_at' | 'price' | '-price' | 'name' | '-name'

export function ProductsBrowsePage() {
  const [searchInput, setSearchInput] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [selectedLicense, setSelectedLicense] = useState<string>('all')
  const [sortOrdering, setSortOrdering] = useState<SortOption>('-created_at')
  const [currentPage, setCurrentPage] = useState(1)

  const debouncedSearch = useDebouncedValue(searchInput.trim(), 300)

  // Reset to page 1 whenever filters change
  const handleSearchChange = (val: string) => {
    setSearchInput(val)
    setCurrentPage(1)
  }

  const handleCategoryChange = (catId: string) => {
    setSelectedCategoryId(catId)
    setCurrentPage(1)
  }

  const handleLicenseChange = (license: string) => {
    setSelectedLicense(license)
    setCurrentPage(1)
  }

  const handleSortChange = (sort: SortOption) => {
    setSortOrdering(sort)
    setCurrentPage(1)
  }

  const handleResetFilters = () => {
    setSearchInput('')
    setSelectedCategoryId('')
    setSelectedLicense('all')
    setSortOrdering('-created_at')
    setCurrentPage(1)
  }

  // Categories Query
  const { data: categoriesData } = useQuery({
    queryKey: ['public-categories-list'],
    queryFn: () => listPublicCategories({ page_size: 100 }),
    staleTime: 1000 * 60 * 5,
  })

  // Products Query
  const {
    data: productsData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: [
      'public-products-browse',
      currentPage,
      selectedCategoryId,
      debouncedSearch,
      sortOrdering,
    ],
    queryFn: () =>
      listPublicProducts({
        page: currentPage,
        page_size: PAGE_SIZE,
        category_id: selectedCategoryId || undefined,
        search: debouncedSearch || undefined,
        ordering: sortOrdering,
      }),
  })

  // Optional client-side filtering for license type if backend doesn't filter license via API
  const filteredProducts = useMemo(() => {
    if (!productsData?.results) return []
    if (selectedLicense === 'all') return productsData.results

    return productsData.results.filter(
      (product) => product.license_type === (selectedLicense as ProductLicenseType),
    )
  }, [productsData, selectedLicense])

  const totalPages = Math.ceil((productsData?.count ?? 0) / PAGE_SIZE)
  const isFiltered =
    Boolean(searchInput) ||
    Boolean(selectedCategoryId) ||
    selectedLicense !== 'all' ||
    sortOrdering !== '-created_at'

  return (
    <main className="products-browse-page">
      {/* Header Banner */}
      <section className="products-browse-hero">
        <div className="products-browse-hero__container">
          <span className="products-browse-hero__badge">Marketplace Catalog</span>
          <h1 className="products-browse-hero__title">Explore Premium 3D Models</h1>
          <p className="products-browse-hero__subtitle">
            High-fidelity 3D assets crafted for game design, architecture, rendering, and visual effects.
          </p>

          <div className="products-browse-search">
            <Input
              type="search"
              placeholder="Search 3D assets by title or keyword..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="products-browse-search__input"
              aria-label="Search 3D models"
            />
          </div>
        </div>
      </section>

      {/* Main Browse Grid Layout */}
      <div className="products-browse-content">
        {/* Sidebar Filters */}
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

          {/* Category Filter */}
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
              {categoriesData?.results.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* License Filter */}
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

          {/* Sort Ordering */}
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

        {/* Results Section */}
        <section className="products-browse-main">
          {/* Top Bar Stats & Sort */}
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

          {/* Content Loading / Error / Empty / Grid */}
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
              <p>Try adjusting your search query, clearing filters, or choosing a different category.</p>
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

              {/* Pagination Controls */}
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
