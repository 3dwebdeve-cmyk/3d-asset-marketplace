import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listPublicPluginCategories, listPublicPlugins } from '../../api/pluginsApi'
import { Button } from '../../components/ui/Button'
import { Pagination } from '../../components/ui/Pagination'
import { SOFTWARE_FILTERS, SoftwareIcon } from '../../components/SoftwareIcon'
import { PLUGINS_HERO_IMAGE_SRC, SiteHeroImage } from '../../components/SiteHeroImage'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import type { PluginLicenseType, PluginOrdering, PublicPlugin } from '../../types/plugin'
import { PluginCard } from './PluginCard'
import { activateOnKey } from '../../lib/keyboard'
import '../../styles/plugins-browse.css'
import '../../styles/products-browse.css'

const PAGE_SIZE = 12

const FORMAT_FILTERS = SOFTWARE_FILTERS

const LICENSE_FILTERS: ReadonlyArray<{ id: PluginLicenseType; label: string }> = [
  { id: 'standard', label: 'Standard License' },
  { id: 'extended', label: 'Extended License' },
]

function matchesFormat(formats: readonly string[], formatId: string): boolean {
  const filter = FORMAT_FILTERS.find((item) => item.id === formatId)
  return Boolean(filter?.value.split(',').some((extension) => formats.includes(extension)))
}

async function loadPluginCatalog(params: {
  categoryId: string
  search: string
  ordering: PluginOrdering
}) {
  const plugins: PublicPlugin[] = []
  let page = 1
  let hasNext = true

  while (hasNext) {
    const response = await listPublicPlugins({
      page,
      page_size: 100,
      category_id: params.categoryId || undefined,
      search: params.search || undefined,
      ordering: params.ordering,
    })
    plugins.push(...response.results)
    hasNext = Boolean(response.next)
    page += 1
  }

  return { plugins }
}

export function PluginsBrowsePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const categoryFromUrl = searchParams.get('category')?.trim() ?? ''
  const searchFromUrl = searchParams.get('search')?.trim() ?? ''

  const [searchInput, setSearchInput] = useState(searchFromUrl)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(categoryFromUrl)
  const [sortOrdering, setSortOrdering] = useState<PluginOrdering>('-created_at')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedFormats, setSelectedFormats] = useState<string[]>([])
  const [selectedLicenses, setSelectedLicenses] = useState<PluginLicenseType[]>([])
  const [minPrice, setMinPrice] = useState(0)
  const [maxPrice, setMaxPrice] = useState(200)
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

  const handleSortChange = (sort: PluginOrdering) => {
    setSortOrdering(sort)
    setCurrentPage(1)
  }

  const toggleFormat = (formatId: string) => {
    setSelectedFormats((current) =>
      current.includes(formatId)
        ? current.filter((item) => item !== formatId)
        : [...current, formatId],
    )
    setCurrentPage(1)
  }

  const toggleLicense = (license: PluginLicenseType) => {
    setSelectedLicenses((current) =>
      current.includes(license)
        ? current.filter((item) => item !== license)
        : [...current, license],
    )
    setCurrentPage(1)
  }

  const handleResetFilters = () => {
    setSearchInput('')
    setSelectedCategoryId('')
    setSortOrdering('-created_at')
    setSelectedFormats([])
    setSelectedLicenses([])
    setMinPrice(0)
    setMaxPrice(200)
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
      selectedCategoryId,
      debouncedSearch,
      sortOrdering,
    ],
    queryFn: () => loadPluginCatalog({
      categoryId: selectedCategoryId,
      search: debouncedSearch,
      ordering: sortOrdering,
    }),
    placeholderData: keepPreviousData,
  })

  const availablePlugins = useMemo(() => pluginsData?.plugins ?? [], [pluginsData?.plugins])
  const filteredPlugins = useMemo(
    () =>
      availablePlugins.filter((plugin) => {
        const price = Number(plugin.discount_price ?? plugin.price)
        const matchesSelectedFormats =
          selectedFormats.length === 0 ||
          selectedFormats.some((formatId) => matchesFormat(plugin.formats ?? [], formatId))
        const matchesSelectedLicenses =
          selectedLicenses.length === 0 || selectedLicenses.includes(plugin.license_type)
        const matchesPrice =
          price >= minPrice && (maxPrice >= 200 || price <= maxPrice)
        return matchesSelectedFormats && matchesSelectedLicenses && matchesPrice
      }),
    [availablePlugins, maxPrice, minPrice, selectedFormats, selectedLicenses],
  )
  const totalCount = filteredPlugins.length
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const plugins = filteredPlugins.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const formatCounts = useMemo(
    () =>
      Object.fromEntries(
        FORMAT_FILTERS.map((format) => [
          format.id,
          availablePlugins.filter((plugin) => matchesFormat(plugin.formats ?? [], format.id)).length,
        ]),
      ),
    [availablePlugins],
  )
  const licenseCounts = useMemo(
    () =>
      Object.fromEntries(
        LICENSE_FILTERS.map((license) => [
          license.id,
          availablePlugins.filter((plugin) => plugin.license_type === license.id).length,
        ]),
      ),
    [availablePlugins],
  )
  const isFiltered =
    Boolean(searchInput) ||
    Boolean(selectedCategoryId) ||
    sortOrdering !== '-created_at' ||
    selectedFormats.length > 0 ||
    selectedLicenses.length > 0 ||
    minPrice > 0 ||
    maxPrice < 200

  const selectedCategoryName = useMemo(() => {
    if (!selectedCategoryId) return null
    return categoriesData?.results.find((cat) => cat.id === selectedCategoryId)?.name ?? null
  }, [categoriesData?.results, selectedCategoryId])

  const heroTitle = selectedCategoryName ?? 'Plugins'

  return (
    <main className="plugins-browse">
      <section className="plugins-browse-hero site-hero-banner">
        <SiteHeroImage src={PLUGINS_HERO_IMAGE_SRC} width={2804} height={561} />
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
            <svg
              className="plugins-filters__header-icon"
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6" />
            </svg>
          </div>

          <div className="plugins-filters__panel">
          <div className="plugins-filters__group" ref={categoryDropdownRef}>
            <label className="plugins-filters__label" id="plugin-category-label">
              Category
            </label>
            <div className="custom-select-dropdown">
              <button
                type="button"
                id="plugin-category-trigger"
                aria-labelledby="plugin-category-label plugin-category-trigger"
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
                    tabIndex={0}
                    onKeyDown={activateOnKey}
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
                      tabIndex={0}
                      onKeyDown={activateOnKey}
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

          <fieldset className="plugins-filters__group plugins-filters__fieldset software-filters">
            <legend className="plugins-filters__label">Software</legend>
            {FORMAT_FILTERS.map((format) => (
              <label className="plugins-filters__option software-filter__row" key={format.id}>
                <input
                  type="checkbox"
                  checked={selectedFormats.includes(format.id)}
                  onChange={() => toggleFormat(format.id)}
                />
                <SoftwareIcon icon={format.icon} color={format.color} />
                <span className="plugins-filters__option-name">{format.label}</span>
                <span className="plugins-filters__option-count">{formatCounts[format.id]}</span>
              </label>
            ))}
          </fieldset>

          <fieldset className="plugins-filters__group plugins-filters__fieldset">
            <legend className="plugins-filters__label">Price</legend>
            <div className="plugins-filters__price-range">
              <div
                className="plugins-filters__price-track"
                style={{ left: `${minPrice / 2}%`, right: `${100 - maxPrice / 2}%` }}
              />
              <input
                type="range"
                min="0"
                max="200"
                step="5"
                value={minPrice}
                aria-label="Minimum price"
                onChange={(event) => {
                  setMinPrice(Math.min(Number(event.target.value), maxPrice))
                  setCurrentPage(1)
                }}
              />
              <input
                type="range"
                min="0"
                max="200"
                step="5"
                value={maxPrice}
                aria-label="Maximum price"
                onChange={(event) => {
                  setMaxPrice(Math.max(Number(event.target.value), minPrice))
                  setCurrentPage(1)
                }}
              />
            </div>
            <div className="plugins-filters__price-labels">
              <span>${minPrice}</span>
              <span>${maxPrice}{maxPrice === 200 ? '+' : ''}</span>
            </div>
          </fieldset>

          <fieldset className="plugins-filters__group plugins-filters__fieldset">
            <legend className="plugins-filters__label">License</legend>
            {LICENSE_FILTERS.map((license) => (
              <label className="plugins-filters__option" key={license.id}>
                <input
                  type="checkbox"
                  checked={selectedLicenses.includes(license.id)}
                  onChange={() => toggleLicense(license.id)}
                />
                <span className="plugins-filters__option-name">{license.label}</span>
                <span className="plugins-filters__option-count">{licenseCounts[license.id]}</span>
              </label>
            ))}
          </fieldset>

          <button
            type="button"
            className="plugins-filters__clear"
            onClick={handleResetFilters}
          >
            <span aria-hidden="true">↻</span> Clear Filters
          </button>
          </div>
        </aside>

        <section className="plugins-browse-main">
          <div className="plugins-browse-toolbar">
            <p className="plugins-browse-toolbar__count">
              Plugin
            </p>
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
