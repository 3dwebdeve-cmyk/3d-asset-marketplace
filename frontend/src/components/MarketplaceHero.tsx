import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

const TRENDING_TAGS = [
  { label: '3D Models', search: '' },
  { label: '3D character', search: '3D character' },
  { label: 'Game Environment', search: 'Game Environment' },
  { label: 'Low Poly', search: 'Low Poly' },
  { label: 'Sci-Fi Vehicles', search: 'Sci-Fi Vehicles' },
] as const

const SORT_PILLS = [
  { label: 'Newest', ordering: '-created_at' },
  { label: 'Top Selling', ordering: '-total_downloads' },
  { label: 'Trending', ordering: '-review_count' },
] as const

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

function ImageFrameIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.2" />
      <circle cx="9" cy="10" r="1.5" />
      <path
        d="m6.5 16.5 3.2-3.4a1.2 1.2 0 0 1 1.7 0L14 15.5l1.4-1.4a1.2 1.2 0 0 1 1.7 0l1.9 1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

export function MarketplaceHero() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')

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
    navigateToModels(searchInput)
  }

  return (
    <section className="home-marketplace-hero" aria-label="Marketplace search">
      <div className="home-marketplace-hero__stage">
        <div className="home-marketplace-hero__shade" aria-hidden="true" />

        <div className="home-marketplace-hero__content">
          <h1 className="home-marketplace-hero__title">
            World&apos;s largest 3D model marketplace
          </h1>

          <form
            className="home-marketplace-search"
            onSubmit={onSearchSubmit}
            role="search"
          >
            <span className="home-marketplace-search__leading" aria-hidden="true">
              <ImageFrameIcon />
            </span>
            <input
              type="search"
              className="home-marketplace-search__input"
              aria-label="Search 3D models"
              placeholder="Search over 2 million models"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
            <button
              type="submit"
              className="home-marketplace-search__submit"
              aria-label="Search marketplace"
            >
              <SearchIcon size={18} strokeWidth={2.15} />
            </button>
          </form>

          <div className="home-marketplace-trending" aria-label="Trending searches">
            <span className="home-marketplace-trending__label">Trending:</span>
            {TRENDING_TAGS.map((tag) => (
              <button
                type="button"
                className="home-marketplace-trending__chip"
                key={tag.label}
                onClick={() => navigateToModels(tag.search)}
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
                className={
                  pill.label === 'Trending'
                    ? 'home-marketplace-sort__btn home-marketplace-sort__btn--active'
                    : 'home-marketplace-sort__btn'
                }
                onClick={() => navigateToModels('', pill.ordering)}
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
