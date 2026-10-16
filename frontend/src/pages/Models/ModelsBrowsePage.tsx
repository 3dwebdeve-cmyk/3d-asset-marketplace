import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { listPublicCategories } from '../../api/categoriesApi'
import { loadModelCatalog } from './modelCatalog'
import { Button } from '../../components/ui/Button'
import { Pagination } from '../../components/ui/Pagination'
import { SOFTWARE_FILTERS, SoftwareIcon } from '../../components/SoftwareIcon'
import { MODELS_HERO_IMAGE_SRC, SiteHeroImage } from '../../components/SiteHeroImage'
import { useDebouncedValue } from '../../hooks/useDebouncedValue'
import { activateOnKey } from '../../lib/keyboard'
import { trackCategoryClick } from '../../lib/trackCategoryClick'
import { ProductCard } from '../Products/ProductCard'
import '../../styles/plugins-browse.css'
import '../../styles/products-browse.css'
import '../../styles/models-browse.css'

const PAGE_SIZE = 12
const PRODUCTS_BANNER_CATEGORY_ID = 'eecb0550-9eeb-41ed-b48d-9da43948650c'
const PRODUCTS_BANNER_IMAGE_SRC = '/images/new%20banner%20image%20size/Moody%20Luxury%20Skincare%20Collection.webp'
const CATEGORY_BANNER_BY_SLUG: Record<string, string> = {
  furniture: '/homepage%20images/banner_furniture_v24.jpg',
  toys: '/images/new%20banner%20image%20size/Wooden%20Train%20and%20Rainbow%20Toys%20on%20NavyBackdrop.webp',
  electronics: '/images/new%20banner%20image%20size/Electronics.webp',
  'food-drink': '/images/new%20banner%20image%20size/Food%20&%20Drink.webp',
  character: '/images/new%20banner%20image%20size/Character.webp',
  industrial: '/images/new%20banner%20image%20size/Industrial.webp',
  '3d-printing': '/images/new%20banner%20image%20size/3D%20Printing.webp',
  'assets-props': '/images/new%20banner%20image%20size/Assets%20%20Props.webp',
  'interactive-webar': '/images/new%20banner%20image%20size/AR%20Armchair%20Studio%20Showcase.webp?v=2',
  'architectural-3d-models': '/images/new%20banner%20image%20size/Architectural%203D%20Models.webp',
  'interior-3d-models': '/images/new%20banner%20image%20size/Cinematic%20Floating%20Pavilion%20Interior.webp',
  'cloth-items': '/images/new%20banner%20image%20size/Cloth%20Items.webp',
  household: '/images/new%20banner%20image%20size/Household.webp',
  'lifestyle-visualisation': '/images/new%20banner%20image%20size/Moody%20Minimalist%20Sofa%20Nook.webp',
  'lifestyle-visualization': '/images/new%20banner%20image%20size/Moody%20Minimalist%20Sofa%20Nook.webp',
  lights: '/images/new%20banner%20image%20size/Moody%20Modern%20Lighting%20Vignette.webp',
  'plants-vegetation': '/images/new%20banner%20image%20size/Moody%20Panoramic%20Indoor%20Plant%20Collection.webp',
  products: PRODUCTS_BANNER_IMAGE_SRC,
}

const FORMAT_OPTIONS = SOFTWARE_FILTERS
const LICENSE_OPTIONS = [
  { value: 'standard', label: 'Standard License' },
  { value: 'extended', label: 'Extended License' },
]
type TraitKey = 'rigged' | 'animated' | 'pbr_ready' | 'game_ready'

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
  const [traits, setTraits] = useState<Record<TraitKey, boolean>>({
    rigged: riggedFromUrl,
    animated: animatedFromUrl,
    pbr_ready: pbrReadyFromUrl,
    game_ready: gameReadyFromUrl,
  })
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
    if (categoryFromUrl) {
      trackCategoryClick(categoryFromUrl)
    }
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

  const formats = searchParams.get('formats')?.split(',').filter(Boolean) ?? []
  const licenses = searchParams.get('licenses')?.split(',').filter(Boolean) ?? []
  const minPrice = Math.max(0, Math.min(200, Number(searchParams.get('min_price')) || 0))
  const maxPrice = Math.max(minPrice, Math.min(200, Number(searchParams.get('max_price') ?? 200) || 0))
  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setCurrentPage(1)
    setSearchParams(next, { replace: true })
  }
  const toggleFilter = (key: string, current: string[], value: string) => {
    const values = value.split(',')
    const active = values.every((item) => current.includes(item))
    updateFilter(key, (active ? current.filter((item) => !values.includes(item)) : [...new Set([...current, ...values])]).join(','))
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
    for (const key of ['formats', 'licenses', 'min_price', 'max_price']) nextParams.delete(key)
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
      selectedCategoryId,
      debouncedSearch,
      sortOrdering,
      traits.rigged,
      traits.animated,
      traits.pbr_ready,
      traits.game_ready,
    ],
    queryFn: () =>
      loadModelCatalog({
        category_id: selectedCategoryId || undefined,
        search: debouncedSearch || undefined,
        ordering: sortOrdering,
        rigged: traits.rigged || undefined,
        animated: traits.animated || undefined,
        pbr_ready: traits.pbr_ready || undefined,
        game_ready: traits.game_ready || undefined,
      }),
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  })

  const priceMatches = (product: NonNullable<typeof productsData>[number]) => {
    const price = Number(product.discount_price ?? product.price)
    return price >= minPrice && (maxPrice === 200 || price <= maxPrice)
  }
  const priceFiltered = (productsData ?? []).filter(priceMatches)
  const facets = {
    formats: Object.fromEntries(FORMAT_OPTIONS.map(({ value }) => [value,
      priceFiltered.filter((product) => value.split(',').some((format) => product.formats.includes(format))).length,
    ])),
    licenses: Object.fromEntries(LICENSE_OPTIONS.map(({ value }) => [value,
      priceFiltered.filter((product) => product.license_type === value).length,
    ])),
  }
  const filteredProducts = priceFiltered.filter((product) =>
    (formats.length === 0 || formats.some((format) => product.formats.includes(format))) &&
    (licenses.length === 0 || licenses.includes(product.license_type)),
  )
  const totalCount = filteredProducts.length
  const products = filteredProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const totalPages = Math.ceil(totalCount / PAGE_SIZE)
  const hasActiveTrait = Object.values(traits).some(Boolean)
  const isFiltered =
    Boolean(searchInput) ||
    Boolean(selectedCategoryId) ||
    sortOrdering !== '-created_at' ||
    hasActiveTrait || formats.length > 0 || licenses.length > 0 || minPrice > 0 || maxPrice < 200

  const selectedCategory = useMemo(() => {
    if (!selectedCategoryId) return null
    return categoriesData?.results.find((cat) => cat.id === selectedCategoryId) ?? null
  }, [categoriesData?.results, selectedCategoryId])

  const heroTitle = selectedCategory?.slug === '3d-printing'
    ? '3D Printing'
    : selectedCategory?.name ?? '3D Model'
  const usesProductsBanner =
    selectedCategoryId === PRODUCTS_BANNER_CATEGORY_ID || selectedCategory?.slug === 'products'
  const usesFurnitureBanner = selectedCategory?.slug === 'furniture'
  const usesCharacterBanner = selectedCategory?.slug === 'character'
  const usesPlantsBanner = selectedCategory?.slug === 'plants-vegetation'
  const usesToysBanner = selectedCategory?.slug === 'toys'
  const usesInteriorBanner = selectedCategory?.slug === 'interior-3d-models'
  const usesInteractiveBanner = selectedCategory?.slug === 'interactive-webar'
  const heroImageSrc = usesProductsBanner
    ? PRODUCTS_BANNER_IMAGE_SRC
    : selectedCategory
      ? CATEGORY_BANNER_BY_SLUG[selectedCategory.slug]
      : MODELS_HERO_IMAGE_SRC

  return (
    <main className="plugins-browse models-browse">
      <section
        className={`plugins-browse-hero site-hero-banner${usesFurnitureBanner ? ' plugins-browse-hero--furniture' : ''}${usesProductsBanner ? ' plugins-browse-hero--products' : ''}${usesCharacterBanner ? ' plugins-browse-hero--character' : ''}${usesPlantsBanner ? ' plugins-browse-hero--plants' : ''}${usesToysBanner ? ' plugins-browse-hero--toys' : ''}${usesInteriorBanner ? ' plugins-browse-hero--interior' : ''}${usesInteractiveBanner ? ' plugins-browse-hero--interactive' : ''}`}
      >
        <SiteHeroImage
          src={heroImageSrc}
          width={selectedCategory ? undefined : 2804}
          height={selectedCategory ? undefined : 561}
        />
        <div className="site-hero-banner__overlay" />
        <div className="plugins-browse-hero__container">
          <h1 className="plugins-browse-hero__title">{heroTitle}</h1>

          <p className="plugins-browse-hero__subtitle">
            Premium 3D models for games, film, and architecture.
            <br />
            Production-ready assets for product design and visualization.
            <br />
            Optimized for <strong>Blender, Maya, 3ds Max, and Cinema 4D.</strong>
          </p>
        </div>
      </section>

      <div className="plugins-browse__body">
        <aside
          className={`plugins-filters${filtersOpen ? ' plugins-filters--open' : ''}`}
          aria-label="3D model filters"
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
            <svg className="model-filters__settings" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18M8 3v6M16 9v6M10 15v6" /></svg>
          </div>

          <div className="plugins-filters__panel">
          <div className="plugins-filters__group" ref={categoryDropdownRef}>
            <label className="plugins-filters__label" id="model-category-label">
              Category
            </label>
            <div className="custom-select-dropdown">
              <button
                type="button"
                id="model-category-trigger"
                aria-labelledby="model-category-label model-category-trigger"
                className={`custom-select-trigger${categoryDropdownOpen ? ' custom-select-trigger--open' : ''}`}
                aria-expanded={categoryDropdownOpen}
                aria-haspopup="listbox"
                onClick={() => setCategoryDropdownOpen((open) => !open)}
              >
                <span className="custom-select-label">
                  {selectedCategory?.name ?? 'All categories'}
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
                        trackCategoryClick(category.id)
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
                id="model-category"
                aria-label="Category"
                value={selectedCategoryId}
                onChange={(event) => {
                  const value = event.target.value
                  setSelectedCategoryId(value)
                  setCurrentPage(1)
                  if (value) trackCategoryClick(value)

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

          <fieldset className="model-filters__group software-filters">
            <legend>Software</legend>
            {FORMAT_OPTIONS.map(({ value, label, icon, color }) => (
              <label className="model-filters__option software-filter__row" key={value}>
                <input type="checkbox" checked={value.split(',').every((item) => formats.includes(item))} onChange={() => toggleFilter('formats', formats, value)} />
                <SoftwareIcon icon={icon} color={color} />
                <span>{label}</span><span className="model-filters__count">{isLoading ? '\u2014' : facets.formats[value]}</span>
              </label>
            ))}
          </fieldset>
          <fieldset className="model-filters__group">
            <legend>Price</legend>
            <div className="model-filters__range">
              <div className="model-filters__track" style={{ background: `linear-gradient(to right, #ddd ${minPrice / 2}%, var(--action-color) ${minPrice / 2}%, var(--action-color) ${maxPrice / 2}%, #ddd ${maxPrice / 2}%)` }} />
              <input aria-label="Minimum price" type="range" min="0" max="200" value={minPrice} onChange={(e) => updateFilter('min_price', String(Math.min(Number(e.target.value), maxPrice)))} />
              <input aria-label="Maximum price" type="range" min="0" max="200" value={maxPrice} onChange={(e) => updateFilter('max_price', String(Math.max(Number(e.target.value), minPrice)))} />
            </div>
            <div className="model-filters__prices"><span>${minPrice}</span><span>${maxPrice}{maxPrice === 200 ? '+' : ''}</span></div>
          </fieldset>
          <fieldset className="model-filters__group">
            <legend>License</legend>
            {LICENSE_OPTIONS.map(({ value, label }) => (
              <label className="model-filters__option" key={value}>
                <input type="checkbox" checked={licenses.includes(value)} onChange={() => toggleFilter('licenses', licenses, value)} />
                <span>{label}</span><span className="model-filters__count">{isLoading ? '\u2014' : facets.licenses[value]}</span>
              </label>
            ))}
          </fieldset>
          <button type="button" className="model-filters__clear" onClick={handleResetFilters}>
            <span aria-hidden="true">&#8635;</span> Clear Filters
          </button>
          </div>
        </aside>

        <section className="plugins-browse-main">
          <div className="plugins-browse-toolbar">
            <p className="plugins-browse-toolbar__count">
              3D model
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
            </div>
          </div>

          {isLoading ? (
            <div className="plugins-grid" aria-label="Loading 3D models">
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
              <p>
                Search is temporarily unavailable. Clear your search query to browse
                the catalog, or try again in a moment.
              </p>
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
              <div className="plugins-grid">
                {products.map((product) => (
                  <ProductCard key={product.id} product={product} />
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
