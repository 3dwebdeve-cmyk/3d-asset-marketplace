import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
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

type IconProps = { className?: string }
type IconComponent = (props: IconProps) => ReactElement

interface BrowseService {
  title: string
  description: string
  path: string
  buttonText: string
  icon: IconComponent
}

function ModelsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 72 72" fill="none" className={className} aria-hidden="true">
      <path
        d="m18 24 18-11 18 11v22L36 57 18 46Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="m18 24 18 11 18-11M36 35v22"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function PluginsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 72 72" fill="none" className={className} aria-hidden="true">
      <path
        d="M29.2 14.8 31 21.2a14 14 0 0 1 4.8 2l6-3.7 5.2 5.2-3.7 6a14 14 0 0 1 2 4.8l6.4 1.8v7.4l-6.4 1.8a14 14 0 0 1-2 4.8l3.7 6-5.2 5.2-6-3.7a14 14 0 0 1-4.8 2l-1.8 6.4h-7.4l-1.8-6.4a14 14 0 0 1-4.8-2l-6 3.7-5.2-5.2 3.7-6a14 14 0 0 1-2-4.8l-6.4-1.8v-7.4l6.4-1.8a14 14 0 0 1 2-4.8l-3.7-6 5.2-5.2 6 3.7a14 14 0 0 1 4.8-2l1.8-6.4h7.4Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="36" cy="36" r="8" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  )
}

function InquiryIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 72 72" fill="none" className={className} aria-hidden="true">
      <circle cx="36" cy="36" r="22" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M24 30h24a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H37l-7 6v-6h-6a5 5 0 0 1-5-5V35a5 5 0 0 1 5-5Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="30" cy="40" r="1.7" fill="currentColor" />
      <circle cx="36" cy="40" r="1.7" fill="currentColor" />
      <circle cx="42" cy="40" r="1.7" fill="currentColor" />
    </svg>
  )
}

function FurnitureIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M5 13h14v3H5v-3ZM7 16v3M17 16v3M6 13V9a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function VehiclesIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 14h16l-1.5-5.2A2 2 0 0 0 16.6 7H7.4a2 2 0 0 0-1.9 1.8L4 14Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M4 14v3h2.5M20 14v3h-2.5M7 17.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM20 17.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  )
}

function ArchitectureIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M4 20h16M6 20V9l6-4 6 4v11M9 12h1M9 15h1M14 12h1M14 15h1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SciFiIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

function DefaultCategoryIcon({ className }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}

const CATEGORY_ICONS: Record<string, IconComponent> = {
  furniture: FurnitureIcon,
  vehicles: VehiclesIcon,
  architecture: ArchitectureIcon,
  'sci-fi': SciFiIcon,
  'sci-fi-assets': SciFiIcon,
  scifi: SciFiIcon,
}

function getCategoryIcon(slug: string): IconComponent | undefined {
  const normalized = slug.trim().toLowerCase()
  if (CATEGORY_ICONS[normalized]) return CATEGORY_ICONS[normalized]
  const match = Object.keys(CATEGORY_ICONS).find((key) => normalized.includes(key))
  return match ? CATEGORY_ICONS[match] : undefined
}

const BROWSE_SERVICES: BrowseService[] = [
  {
    title: '3D Models',
    description: 'Explore high-quality production-ready 3D models in all categories.',
    path: '/3d-models',
    buttonText: 'Shop 3D models',
    icon: ModelsIcon,
  },
  {
    title: 'Plugins & Tools',
    description: 'Power-up your workflow with professional Blender and Unreal plugins.',
    path: '/plugins',
    buttonText: 'Explore Plugins',
    icon: PluginsIcon,
  },
  {
    title: 'Inquiry Portal',
    description: 'Have a specific custom asset requirement? Contact our VFX artist team.',
    path: '/custom-projects',
    buttonText: 'Submit an Inquiry',
    icon: InquiryIcon,
  },
]

function scrollRail(rail: HTMLElement | null, direction: -1 | 1) {
  if (!rail) return
  const amount = Math.max(rail.clientWidth * 0.75, 280)
  rail.scrollBy({ left: direction * amount, behavior: 'smooth' })
}

function ServiceCard({ service }: { service: BrowseService }) {
  const IconComponent = service.icon

  return (
    <article className="browse-service-card">
      <div className="browse-service-card__copy">
        <h3 className="browse-service-card__title">{service.title}</h3>
        <p className="browse-service-card__text">{service.description}</p>
        <Link to={service.path} className="browse-service-card__btn">
          {service.buttonText}
        </Link>
      </div>
      <div className="browse-service-card__art" aria-hidden="true">
        <IconComponent className="browse-service-card__icon" />
      </div>
    </article>
  )
}

function CategoryTile({
  category,
  onSelect,
}: {
  category: CategoryPublic
  onSelect: () => void
}) {
  const [imgError, setImgError] = useState(false)
  const IconComponent = getCategoryIcon(category.slug)

  return (
    <button
      type="button"
      className="browse-category-card"
      onClick={onSelect}
      aria-label={`Browse ${category.name} 3D models`}
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
        <div className="browse-category-card__overlay" aria-hidden="true" />
      </div>
      <div className="browse-category-card__content">
        <div className="browse-category-card__icon-badge" aria-hidden="true">
          {IconComponent ? (
            <IconComponent className="browse-category-card__icon" />
          ) : (
            <DefaultCategoryIcon className="browse-category-card__icon" />
          )}
        </div>
        <span className="browse-category-card__name">{category.name}</span>
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

        <section className="browse-service-cards" aria-label="Marketplace modules">
          {BROWSE_SERVICES.map((service) => (
            <ServiceCard key={service.path} service={service} />
          ))}
        </section>

        <section
          className="browse-rail-section browse-rail-section--categories"
          aria-labelledby="explore-categories-heading"
        >
          <div className="browse-rail-section__header">
            <h2 id="explore-categories-heading" className="browse-rail-section__title">
              Explore 3D Categories
            </h2>
          </div>
          <div className="browse-category-grid">
            {categories.length === 0 ? (
              <p className="browse-rail__empty">Categories will appear here as the catalog grows.</p>
            ) : (
              categories.map((category) => (
                <CategoryTile
                  key={category.id}
                  category={category}
                  onSelect={() => {
                    navigate(`/3d-models?category=${encodeURIComponent(category.id)}`)
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
