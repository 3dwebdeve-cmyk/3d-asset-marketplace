import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

interface TrendingTag {
  label: string
  search: string
}

interface SortPill {
  label: string
  ordering: string
}

type SearchCategory = 'plugins' | 'models'

const TRENDING_TAGS: readonly TrendingTag[] = [
  { label: '3D Models', search: '' },
  { label: 'Furniture', search: 'Furniture' },
  { label: 'Interior', search: 'Interior' },
  { label: 'Lighting', search: 'Lighting' },
  { label: 'Plants', search: 'Plants' },
]

const SORT_PILLS: readonly SortPill[] = [
  { label: 'Newest', ordering: '-created_at' },
  { label: 'Top Selling', ordering: '-total_downloads' },
  { label: 'Trending', ordering: '-review_count' },
]

function ArrowUpRightIcon({ size = 9 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M4 12 12 4M6 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SearchIcon({ size = 18, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" strokeLinecap="round" />
    </svg>
  )
}

function ArrowRightIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M5 12h14M14 7l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function MarketplaceHero() {
  const navigate = useNavigate()
  const stageRef = useRef<HTMLDivElement>(null)
  const [searchInput, setSearchInput] = useState('')
  const [searchCategory, setSearchCategory] = useState<SearchCategory>('models')
  const [activeSort, setActiveSort] = useState<string>('-review_count')
  const [activeTag, setActiveTag] = useState<string | null>(null)

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let frame: number | null = null
    const update = () => {
      frame = null
      const rect = stage.getBoundingClientRect()
      const distance = Math.max(1, rect.top + window.scrollY + rect.height)
      const progress = Math.max(0, Math.min(1, window.scrollY / distance))
      stage.style.setProperty('--hero-scroll-scale', preference?.matches ? '1' : String(1 + progress * 0.06))
    }
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    preference?.addEventListener('change', schedule)
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      preference?.removeEventListener('change', schedule)
      stage.style.removeProperty('--hero-scroll-scale')
    }
  }, [])

  const navigateToModels = (search: string, ordering = '') => {
    const params = new URLSearchParams()
    const query = search.trim().slice(0, 100)
    if (query) params.set('search', query)
    if (ordering) params.set('ordering', ordering)
    const queryString = params.toString()
    navigate(queryString ? `/3d-models?${queryString}` : '/3d-models')
  }

  const onSearchSubmit = (event: FormEvent) => {
    event.preventDefault()
    const query = searchInput.trim().slice(0, 100)
    const path = searchCategory === 'plugins' ? '/plugins' : '/3d-models'
    navigate(query ? `${path}?search=${encodeURIComponent(query)}` : path)
  }

  const handleTagClick = (tag: TrendingTag) => {
    setActiveTag(tag.label)
    setSearchInput(tag.search)
    navigateToModels(tag.search)
  }

  const handleSortClick = (pill: SortPill) => {
    setActiveSort(pill.ordering)
    navigateToModels(searchInput, pill.ordering)
  }

  return (
    <section className="home-marketplace-hero" aria-label="Marketplace search">
      <div className="home-marketplace-hero__stage" ref={stageRef}>
        <div className="home-marketplace-hero__shade" aria-hidden="true" />

        <div className="home-marketplace-hero__content">
          <h1 className="home-marketplace-hero__title">
            Furniture &amp; interior 3D models for visualization and design
          </h1>

          <form
            className="home-marketplace-search"
            onSubmit={onSearchSubmit}
            role="search"
          >
            <div className="home-marketplace-search__category">
              <select
                aria-label="Search category"
                value={searchCategory}
                onChange={(event) => setSearchCategory(event.target.value as SearchCategory)}
              >
                <option value="plugins">Plugins</option>
                <option value="models">3D Models</option>
              </select>
            </div>
            <label className="home-marketplace-search__field">
              <SearchIcon size={17} strokeWidth={1.7} />
              <input
                type="search"
                className="home-marketplace-search__input"
                aria-label="Search marketplace"
                placeholder="Search furniture, interiors, lighting, plugins…"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="home-marketplace-search__submit"
            >
              <span>Search</span>
              <ArrowRightIcon />
            </button>
          </form>

          <div className="home-marketplace-trending" aria-label="Trending searches">
            <span className="home-marketplace-trending__label">Trending:</span>
            {TRENDING_TAGS.map((tag) => (
              <button
                type="button"
                className={`home-marketplace-trending__chip${
                  activeTag === tag.label ? ' home-marketplace-trending__chip--active' : ''
                }`}
                key={tag.label}
                aria-pressed={activeTag === tag.label}
                onClick={() => handleTagClick(tag)}
              >
                <ArrowUpRightIcon />
                {tag.label}
              </button>
            ))}
          </div>

          <div className="home-marketplace-sort" role="group" aria-label="Sort 3D models">
            {SORT_PILLS.map((pill) => (
              <button
                type="button"
                key={pill.label}
                className={`home-marketplace-sort__btn${
                  activeSort === pill.ordering ? ' home-marketplace-sort__btn--active' : ''
                }`}
                aria-pressed={activeSort === pill.ordering}
                onClick={() => handleSortClick(pill)}
              >
                <ArrowUpRightIcon size={10} />
                {pill.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
