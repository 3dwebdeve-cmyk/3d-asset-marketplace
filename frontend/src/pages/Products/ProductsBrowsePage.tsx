import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { listPublicCategories } from '../../api/categoriesApi'
import { listPublicPlugins } from '../../api/pluginsApi'
import { listPublicProducts } from '../../api/productsApi'
import { MarketplaceHero } from '../../components/MarketplaceHero'
import { Button } from '../../components/ui/Button'
import type { CategoryPublic } from '../../types/category'
import { PluginCard } from '../Plugins/PluginCard'
import { ProductCard } from './ProductCard'

const HUB_PREVIEW_SIZE = 6

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
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const categoryFromUrl = searchParams.get('category')?.trim() ?? ''
  const searchFromUrl = searchParams.get('search')?.trim() ?? ''
  const viewAll = searchParams.get('view') === 'all'
  const isCatalogMode = Boolean(searchFromUrl || categoryFromUrl || viewAll)

  // Old /products catalog mode is replaced by /3d-models — redirect there.
  useEffect(() => {
    if (!isCatalogMode) return
    const next = new URLSearchParams()
    if (searchFromUrl) next.set('search', searchFromUrl)
    if (categoryFromUrl) next.set('category', categoryFromUrl)
    const qs = next.toString()
    navigate(qs ? `/3d-models?${qs}` : '/3d-models', { replace: true })
  }, [isCatalogMode, searchFromUrl, categoryFromUrl, navigate])

  const categoriesRailRef = useRef<HTMLDivElement>(null)
  const productsRailRef = useRef<HTMLDivElement>(null)
  const pluginsRailRef = useRef<HTMLDivElement>(null)

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
    queryKey: ['public-products-browse', 'hub'],
    queryFn: () =>
      listPublicProducts({
        page: 1,
        page_size: HUB_PREVIEW_SIZE,
        ordering: '-created_at',
      }),
    placeholderData: keepPreviousData,
    enabled: !isCatalogMode,
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

  const filteredProducts = useMemo(() => productsData?.results ?? [], [productsData])

  const categories = categoriesData?.results ?? []
  const plugins = pluginsData?.results ?? []

  if (!isCatalogMode) {
    return (
      <main className="products-browse-page products-browse-page--hub">
        <MarketplaceHero />

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
              Explore high quality production-ready 3D models in all categories.
            </p>
            <Link className="browse-module-card__cta" to="/3d-models">
              Shop 3D models
            </Link>
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
            <h2 className="browse-module-card__title">Plugins &amp; Tools</h2>
            <p className="browse-module-card__text">
              Power up your workflow with professional Blender and Unreal plugins.
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
              Have a specific custom asset requirement? Contact our VFX artist team.
            </p>
            <Link className="browse-module-card__cta" to="/custom-projects">
              Submit an Inquiry
            </Link>
          </article>
        </section>

        <section
          className="browse-rail-section browse-rail-section--categories"
          aria-labelledby="explore-categories-heading"
        >
          <div className="browse-rail-section__header">
            <h2 id="explore-categories-heading" className="browse-rail-section__title">
              Explore 3D Categories
            </h2>
            <div className="browse-rail-section__actions">
              <Link className="browse-rail-section__view-all" to="/3d-models">
                View All
              </Link>
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
                  onSelect={(id) => {
                    navigate(`/3d-models?category=${encodeURIComponent(id)}`)
                  }}
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
              <Link className="browse-rail-section__view-all" to="/3d-models">
                View All
              </Link>
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

  // Catalog mode redirects to /3d-models in the effect above.
  return (
    <main className="products-browse-page" aria-busy="true">
      <p className="plugins-browse-toolbar__count">Opening 3D models…</p>
    </main>
  )
}
