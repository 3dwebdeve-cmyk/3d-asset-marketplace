import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { listPublicCategories } from '../api/categoriesApi'

export function MarketplaceHero() {
  const navigate = useNavigate()
  const [searchInput, setSearchInput] = useState('')

  const categoriesQuery = useQuery({
    queryKey: ['home-product-categories'],
    queryFn: () => listPublicCategories({ page_size: 100 }),
    staleTime: 1000 * 60 * 5,
  })

  const categories = categoriesQuery.data?.results ?? []

  const navigateToModels = (search: string, categoryId: string) => {
    const params = new URLSearchParams()
    const query = search.trim().slice(0, 100)
    if (query) params.set('search', query)
    if (categoryId) params.set('category', categoryId)
    const queryString = params.toString()
    navigate(queryString ? `/3d-models?${queryString}` : '/3d-models')
  }

  const onSearchSubmit = (event: FormEvent) => {
    event.preventDefault()
    navigateToModels(searchInput, '')
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
              width="17"
              height="17"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="m12 2 8 4.5v11L12 22l-8-4.5v-11z" />
              <path d="m4.5 6.8 7.5 4.3 7.5-4.3M12 11v10.4" />
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

        {categories.length > 0 ? (
          <div className="home-marketplace-trending" aria-label="Browse categories">
            <span>Trending:</span>
            {categories.slice(0, 10).map((category) => (
              <button
                type="button"
                key={category.id}
                onClick={() => navigateToModels('', category.id)}
              >
                ↗ {category.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
