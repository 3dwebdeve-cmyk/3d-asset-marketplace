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
    <section className="home-page__hero home-marketplace-hero">
      <div className="home-marketplace-hero__shade" aria-hidden="true" />
      <div className="home-page__hero-inner">
        <h1>World&apos;s largest 3D model marketplace</h1>

        <form
          className="home-marketplace-search"
          onSubmit={onSearchSubmit}
          role="search"
        >
          <span className="home-marketplace-search__leading" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.6-3.6" />
            </svg>
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
            <svg
              viewBox="0 0 24 24"
              width="21"
              height="21"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.6-3.6" />
            </svg>
          </button>
        </form>

        <div className="home-marketplace-trending" aria-label="Trending searches">
          <span>Trending:</span>
          {TRENDING_TAGS.map((tag) => (
            <button
              type="button"
              key={tag.label}
              onClick={() => navigateToModels(tag.search)}
            >
              <svg
                viewBox="0 0 16 16"
                width="11"
                height="11"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <path d="M4 12 12 4M6 4h6v6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
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
              {pill.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
