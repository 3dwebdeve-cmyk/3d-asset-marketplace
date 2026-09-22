import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement, RefObject } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { listTrendingCategories } from '../../api/categoriesApi'
import { listPublicPlugins } from '../../api/pluginsApi'
import { listPublicProducts } from '../../api/productsApi'
import { MarketplaceHero } from '../../components/MarketplaceHero'
import { Button } from '../../components/ui/Button'
import { trackCategoryClick } from '../../lib/trackCategoryClick'
import { useAuthStore } from '../../store/authStore'
import type { CategoryPublic } from '../../types/category'
import { PluginCard } from '../Plugins/PluginCard'
import { ProductCard } from './ProductCard'
import '../../styles/home.css'
import '../../styles/products-browse.css'

const HUB_PREVIEW_SIZE = 6

type IconProps = { className?: string }
type IconComponent = (props: IconProps) => ReactElement

interface BrowseService {
  title: string
  description: string
  path: string
  buttonText: string
  iconSrc: string
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
    buttonText: 'Shop 3D Models',
    iconSrc: '/images/home/icon-3d-models.png',
  },
  {
    title: 'Plugins & Tools',
    description: 'Power-up your workflow with professional Blender and Unreal plugins.',
    path: '/plugins',
    buttonText: 'Explore Plugins',
    iconSrc: '/images/home/icon-plugins.png',
  },
  {
    title: 'Inquiry Portal',
    description: 'Have a specific custom asset requirement? Our team is here to help.',
    path: '/custom-projects',
    buttonText: 'Submit an Inquiry',
    iconSrc: '/images/home/icon-inquiry.png',
  },
]

function useAutoScrollRail(
  railRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    const rail = railRef.current
    if (!rail || !enabled) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let paused = false
    let frame = 0
    let last = performance.now()
    const speedPxPerSec = 36

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      if (!paused && rail.scrollWidth > rail.clientWidth + 1) {
        const maxScroll = rail.scrollWidth - rail.clientWidth
        const next = rail.scrollLeft + speedPxPerSec * dt
        rail.scrollLeft = next >= maxScroll - 0.5 ? 0 : next
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)

    const pause = () => {
      paused = true
    }
    const resume = () => {
      paused = false
      last = performance.now()
    }
    const onVisibility = () => {
      if (document.hidden) {
        paused = true
      } else {
        resume()
      }
    }

    rail.addEventListener('pointerenter', pause)
    rail.addEventListener('pointerleave', resume)
    rail.addEventListener('focusin', pause)
    rail.addEventListener('focusout', resume)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(frame)
      rail.removeEventListener('pointerenter', pause)
      rail.removeEventListener('pointerleave', resume)
      rail.removeEventListener('focusin', pause)
      rail.removeEventListener('focusout', resume)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [railRef, enabled])
}

const OFFER_SERVICES = [
  {
    title: 'Custom 3D Model',
    cta: 'Get Custom Model',
    icon: 'cube',
    summary: 'High-quality, custom 3D models built precisely for your project needs.',
    points: [
      'Product & game-ready models',
      'Characters, props & environments',
      'Clean & optimized topology',
      'Fully customized designs',
    ],
  },
  {
    title: 'Custom Plugin',
    cta: 'Get Custom Plugin',
    icon: 'plugin',
    summary: 'Powerful Blender add-ons and tools to supercharge your workflow.',
    points: [
      'Custom Blender add-ons',
      'Workflow automation',
      'Time-saving tools',
      'Seamless integration',
    ],
  },
  {
    title: 'Custom Texturing',
    cta: 'Get Custom Texture',
    icon: 'pencil',
    summary: 'Realistic and stylized textures that bring your 3D models to life.',
    points: [
      'PBR & stylized texturing',
      'Custom material creation',
      'UV mapping & optimization',
      'Game-ready textures',
    ],
  },
  {
    title: 'Custom Rendering',
    cta: 'Get Custom Render',
    icon: 'camera',
    summary: 'High-quality renders with perfect lighting, composition and detail.',
    points: [
      'Photorealistic renders',
      'Custom lighting & setup',
      'Camera composition',
      'High-resolution output',
    ],
  },
] as const

function OfferIcon({ name }: { name: (typeof OFFER_SERVICES)[number]['icon'] }) {
  switch (name) {
    case 'cube':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
          <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
        </svg>
      )
    case 'plugin':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="8" cy="8" r="2.25" />
          <circle cx="16" cy="8" r="2.25" />
          <circle cx="8" cy="16" r="2.25" />
          <circle cx="16" cy="16" r="2.25" />
          <path d="M10.1 8h3.8M8 10.1v3.8M16 10.1v3.8M10.1 16h3.8" />
        </svg>
      )
    case 'pencil':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
          <path d="m13.5 6.5 3 3" />
        </svg>
      )
    case 'camera':
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
          <circle cx="12" cy="13" r="3" />
        </svg>
      )
  }
}

function ServiceModule({ service }: { service: BrowseService }) {
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
        <img
          src={service.iconSrc}
          alt=""
          className="browse-service-card__icon-img"
          loading="lazy"
          decoding="async"
        />
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
  const clearPostLogoutRedirect = useAuthStore((state) => state.clearPostLogoutRedirect)
  const [searchParams] = useSearchParams()
  const categoryFromUrl = searchParams.get('category')?.trim() ?? ''
  const searchFromUrl = searchParams.get('search')?.trim() ?? ''
  const viewAll = searchParams.get('view') === 'all'
  const isCatalogMode = Boolean(searchFromUrl || categoryFromUrl || viewAll)

  useEffect(() => {
    clearPostLogoutRedirect()
  }, [clearPostLogoutRedirect])

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

  const { data: trendingCategories = [] } = useQuery({
    queryKey: ['public-categories-trending', { limit: 12 }],
    queryFn: () => listTrendingCategories(12),
    staleTime: 1000 * 60,
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

  const categories = trendingCategories.slice(0, 12)
  const plugins = pluginsData?.results ?? []

  useAutoScrollRail(productsRailRef, !isCatalogMode && filteredProducts.length > 1)
  useAutoScrollRail(pluginsRailRef, !isCatalogMode && plugins.length > 1)

  if (!isCatalogMode) {
    return (
      <main className="products-browse-page products-browse-page--hub">
        <MarketplaceHero />

        <section className="browse-service-cards" aria-label="Marketplace modules">
          {BROWSE_SERVICES.map((service) => (
            <ServiceModule key={service.path} service={service} />
          ))}
        </section>

        <section
          className="browse-rail-section browse-rail-section--categories"
          aria-labelledby="trending-categories-heading"
        >
          <div className="browse-rail-section__header">
            <h2 id="trending-categories-heading" className="browse-rail-section__title">
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
                    trackCategoryClick(category.id)
                    navigate(`/3d-models?category=${encodeURIComponent(category.id)}`)
                  }}
                />
              ))
            )}
          </div>
        </section>

        <section className="browse-rail-section browse-rail-section--models" aria-labelledby="shop-models-heading">
          <div className="browse-rail-section__header">
            <h2 id="shop-models-heading" className="browse-rail-section__title">
              Popular 3D Models
            </h2>
            <Link className="browse-rail-section__view-all" to="/3d-models">
              Explore All Models
            </Link>
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
            <div
              className="browse-rail browse-rail--cards browse-rail--auto"
              ref={productsRailRef}
              aria-label="Shop 3D Models"
            >
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
            <Link className="browse-rail-section__view-all" to="/plugins">
              View All
            </Link>
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
            <div
              className="browse-rail browse-rail--cards browse-rail--auto"
              ref={pluginsRailRef}
              aria-label="Explore Plugins"
            >
              {plugins.map((plugin) => (
                <div key={plugin.id} className="browse-rail__item">
                  <PluginCard plugin={plugin} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          className="browse-rail-section browse-rail-section--models hub-offer"
          aria-labelledby="what-we-offer-heading"
        >
          <div className="browse-rail-section__header">
            <h2 id="what-we-offer-heading" className="browse-rail-section__title">
              What we offer
            </h2>
          </div>
          <div className="hub-offer__grid">
            {OFFER_SERVICES.map((offer) => (
              <article key={offer.title} className="hub-offer__card">
                <div className="hub-offer__media">
                  <div className="hub-offer__details">
                    <p>{offer.summary}</p>
                    <ul>
                      {offer.points.map((point) => (
                        <li key={point}>
                          <span className="hub-offer__check" aria-hidden="true">
                            <svg viewBox="0 0 16 16">
                              <circle cx="8" cy="8" r="8" />
                              <path d="M4.5 8.2 6.8 10.4 11.5 5.6" />
                            </svg>
                          </span>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="hub-offer__label">
                  <span className="hub-offer__icon">
                    <OfferIcon name={offer.icon} />
                  </span>
                  <h3>{offer.title}</h3>
                </div>
                <Link className="home-page__cta hub-offer__cta" to="/custom-projects">
                  {offer.cta}
                </Link>
              </article>
            ))}
          </div>
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
