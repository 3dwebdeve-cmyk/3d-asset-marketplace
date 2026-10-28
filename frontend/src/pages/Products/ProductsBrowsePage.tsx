import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { listTrendingCategories } from '../../api/categoriesApi'
import { listPublicPlugins } from '../../api/pluginsApi'
import { listPublicProducts } from '../../api/productsApi'
import { CategoryTile } from '../../components/CategoryTile'
import { MarketplaceHero } from '../../components/MarketplaceHero'
import { useAllCategories } from '../../hooks/useAllCategories'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { HOME_DESCRIPTION, HOME_TITLE, buildOrganizationJsonLd, buildWebSiteJsonLd } from '../../lib/seo'
import { trackCategoryClick } from '../../lib/trackCategoryClick'
import { useAuthStore } from '../../store/authStore'
import type { CategoryPublic } from '../../types/category'
import { PluginCard } from '../Plugins/PluginCard'
import { ProductCard } from './ProductCard'
import '../../styles/home.css'
import '../../styles/products-browse.css'

const HUB_PREVIEW_SIZE = 6

interface BrowseService {
  title: string
  description: string
  path: string
  buttonText: string
  iconSrc: string
  iconWidth: number
  iconHeight: number
}

const CATEGORY_DISPLAY_ORDER = [
  'furniture', 'products', 'toys', 'electronics', 'food-drink', 'character',
  'industrial', '3d-printing', 'assets-props', 'interactive-webar',
  'architectural-3d-models', 'interior-3d-models',
]

const FALLBACK_CATEGORIES: CategoryPublic[] = [
  ['furniture', 'Furniture'],
  ['products', 'Products'],
  ['toys', 'Toys'],
  ['electronics', 'Electronics'],
  ['food-drink', 'Food & Drink'],
  ['character', 'Characters'],
  ['industrial', 'Industrial'],
  ['3d-printing', '3D Printing'],
  ['assets-props', 'Assets & Props'],
  ['interactive-webar', 'Interactive WebAR'],
  ['architectural-3d-models', 'Architecture'],
  ['interior-3d-models', 'Interiors'],
].map(([slug, name]) => ({
  id: `fallback-${slug}`,
  name,
  slug,
  description: '',
  image: '',
  parent: null,
  created_at: '2026-01-01T00:00:00Z',
}))

// Demo catalog is for local development only. Production shows the real empty
// state instead of invented products when the API returns nothing or fails.
const SHOW_DEMO_FALLBACK = import.meta.env.DEV

const BROWSE_SERVICES: BrowseService[] = [
  {
    title: '3D Models',
    description: 'Browse production-ready 3D models of furniture, interiors, lighting, plants and more.',
    path: '/3d-models',
    buttonText: 'Shop 3D Models',
    iconSrc: '/images/home/icon-3d-models.webp',
    iconWidth: 489,
    iconHeight: 450,
  },
  {
    title: 'Plugins & Tools',
    description: 'Speed up your 3D workflow with Blender and Unreal plugins and tools.',
    path: '/plugins',
    buttonText: 'Explore Plugins',
    iconSrc: '/images/home/icon-plugins.webp',
    iconWidth: 476,
    iconHeight: 535,
  },
  {
    title: 'Inquiry Portal',
    description: 'Need a custom 3D model, texture or render? Send your brief and our team will reply.',
    path: '/custom-projects',
    buttonText: 'Submit an Inquiry',
    iconSrc: '/images/home/icon-inquiry.webp',
    iconWidth: 483,
    iconHeight: 464,
  },
]

function useAutoScrollRail(
  railRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    const rail = railRef.current
    if (!rail || !enabled) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    let paused = false
    let frame = 0
    let last = performance.now()
    const speedPxPerSec = 40

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      if (!paused && rail.scrollWidth > rail.clientWidth + 1) {
        const firstDup = rail.querySelector('[data-cycle="1"]') as HTMLElement | null
        const firstChild = rail.firstElementChild as HTMLElement | null
        if (firstDup && firstChild) {
          const cycleWidth = firstDup.offsetLeft - firstChild.offsetLeft
          if (cycleWidth > 0) {
            rail.scrollLeft += speedPxPerSec * dt
            if (rail.scrollLeft >= cycleWidth) {
              rail.scrollLeft -= cycleWidth
            }
          } else {
            const maxScroll = rail.scrollWidth - rail.clientWidth
            const next = rail.scrollLeft + speedPxPerSec * dt
            rail.scrollLeft = next >= maxScroll - 0.5 ? 0 : next
          }
        } else {
          const maxScroll = rail.scrollWidth - rail.clientWidth
          const next = rail.scrollLeft + speedPxPerSec * dt
          rail.scrollLeft = next >= maxScroll - 0.5 ? 0 : next
        }
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

function getRailDisplayItems<T extends { id: string }>(items: T[]) {
  if (items.length <= 1) {
    return items.map((item) => ({ item, cycle: 0, key: item.id }))
  }
  const minTarget = 8
  const repetitions = Math.max(2, Math.ceil(minTarget / items.length))
  const list: { item: T; cycle: number; key: string }[] = []
  for (let cycle = 0; cycle < repetitions; cycle++) {
    for (const item of items) {
      list.push({
        item,
        cycle,
        key: cycle === 0 ? item.id : `${item.id}-cycle-${cycle}`,
      })
    }
  }
  return list
}

const OFFER_SERVICES = [
  {
    title: 'Custom 3D Model',
    cta: 'Get Custom Model',
    icon: 'cube',
    image: '/images/custom-3Dmodel.webp',
    imageWidth: 1536,
    imageHeight: 1024,
    summary: 'Custom 3D models for furniture, products and interiors, built precisely for your project.',
    points: [
      'Furniture, product & game-ready models',
      'Interiors, props & environments',
      'Clean & optimized topology',
      'Fully customized designs',
    ],
  },
  {
    title: 'Custom Plugin',
    cta: 'Get Custom Plugin',
    icon: 'plugin',
    image: '/images/custom-plugin.webp',
    imageWidth: 1536,
    imageHeight: 1024,
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
    image: '/images/custom-texture.webp',
    imageWidth: 1254,
    imageHeight: 1254,
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
    image: '/images/custom-render.webp',
    imageWidth: 1717,
    imageHeight: 916,
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
        <h2 className="browse-service-card__title">{service.title}</h2>
        <p className="browse-service-card__text">{service.description}</p>
        <Link to={service.path} className="browse-service-card__btn">
          {service.buttonText}
        </Link>
      </div>
      <div className="browse-service-card__art" aria-hidden="true">
        <img
          src={service.iconSrc}
          alt=""
          width={service.iconWidth}
          height={service.iconHeight}
          className="browse-service-card__icon-img"
          loading="lazy"
          decoding="async"
        />
      </div>
    </article>
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
  const { data: allCategories } = useAllCategories(!isCatalogMode)

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
    queryKey: ['public-categories-trending', { limit: 50 }],
    queryFn: () => listTrendingCategories(50),
    staleTime: 1000 * 60,
  })

  const {
    data: productsData,
    isLoading,
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

  const filteredProducts = useMemo(
    () => productsData?.results ?? [],
    [productsData],
  )

  const categoriesSource = trendingCategories.length
    ? trendingCategories
    : SHOW_DEMO_FALLBACK ? FALLBACK_CATEGORIES : []
  const categories = [...categoriesSource].sort((a, b) => {
    const rank = (slug: string) => {
      const index = CATEGORY_DISPLAY_ORDER.indexOf(slug.trim().toLowerCase())
      return index === -1 ? CATEGORY_DISPLAY_ORDER.length : index
    }
    return rank(a.slug) - rank(b.slug)
  }).slice(0, 12)
  const plugins = pluginsData?.results ?? []

  useAutoScrollRail(productsRailRef, !isCatalogMode && !isLoading && filteredProducts.length > 1)
  useAutoScrollRail(pluginsRailRef, !isCatalogMode && !pluginsLoading && plugins.length > 1)

  useDocumentSeo({
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    canonicalPath: '/',
    jsonLd: [buildOrganizationJsonLd(), buildWebSiteJsonLd()],
  })

  if (!isCatalogMode) {
    return (
      <main className="products-browse-page products-browse-page--hub">
        <MarketplaceHero />

        <section className="browse-service-cards" aria-labelledby="marketplace-services-heading">
          <h2 id="marketplace-services-heading" className="visually-hidden">Explore the AssetHive3D marketplace</h2>
          {BROWSE_SERVICES.map((service) => (
            <ServiceModule key={service.path} service={service} />
          ))}
        </section>

        <section
          className="browse-rail-section browse-rail-section--categories"
          aria-labelledby="trending-categories-heading"
          role="region"
        >
          <div className="browse-rail-section__header">
            <h2 id="trending-categories-heading" className="browse-rail-section__title">
              Trending Categories
            </h2>
            <Link className="browse-rail-section__view-all" to="/categories">
              View all {allCategories ? `${allCategories.length} ` : ''}
              {allCategories?.length === 1 ? 'category' : 'categories'} →
            </Link>
          </div>
          <div className="browse-category-grid">
            {categories.length === 0 ? (
              <p className="browse-rail__empty">Categories will appear here as the catalog grows.</p>
            ) : (
              categories.map((category) => (
                <CategoryTile
                  key={category.id}
                  category={category}
                  onSelect={() => trackCategoryClick(category.id)}
                />
              ))
            )}
          </div>
        </section>

        <section className="browse-rail-section browse-rail-section--models" aria-labelledby="shop-models-heading">
          <div className="browse-rail-section__header">
            <h2 id="shop-models-heading" className="browse-rail-section__title">
              Shop 3D Models
            </h2>
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
          ) : (
            <div
              className="browse-rail browse-rail--cards browse-rail--auto"
              ref={productsRailRef}
              aria-label="Shop 3D Models"
            >
              {getRailDisplayItems(filteredProducts).map(({ item: product, cycle, key }) => (
                <div
                  key={key}
                  className="browse-rail__item"
                  data-cycle={cycle}
                  inert={cycle > 0 ? true : undefined}
                >
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="browse-rail-section browse-rail-section--plugins" aria-labelledby="explore-plugins-heading">
          <div className="browse-rail-section__header">
            <h2 id="explore-plugins-heading" className="browse-rail-section__title">
              Explore Plugins
            </h2>
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
          ) : (
            <div
              className="browse-rail browse-rail--cards browse-rail--auto"
              ref={pluginsRailRef}
              aria-label="Explore Plugins"
            >
              {getRailDisplayItems(plugins).map(({ item: plugin, cycle, key }) => (
                <div
                  key={key}
                  className="browse-rail__item"
                  data-cycle={cycle}
                  inert={cycle > 0 ? true : undefined}
                >
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
                {/* tabIndex lets a tap or keyboard focus reveal the details via :focus-within. */}
                <div className="hub-offer__media" tabIndex={0}>
                  {offer.image ? (
                    <img
                      className={
                        offer.image.includes('custom-texture')
                          ? 'hub-offer__thumb hub-offer__thumb--contain'
                          : 'hub-offer__thumb'
                      }
                      src={offer.image}
                      alt={`${offer.title} service preview`}
                      width={offer.imageWidth}
                      height={offer.imageHeight}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : null}
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
