import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { CategoryTile } from '../../components/CategoryTile'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { useAllCategories } from '../../hooks/useAllCategories'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { CATEGORIES_SEO } from '../../lib/seoPages'
import { trackCategoryClick } from '../../lib/trackCategoryClick'
import '../../styles/products-browse.css'
import '../../styles/all-categories.css'

const CATEGORY_ORDER = [
  'furniture', 'products', 'toys', 'electronics', 'food-drink', 'character',
  'industrial', 'household', 'plants-vegetation', 'lights', '3d-printing',
  'assets-props', 'lifestyle-visualisation', 'cloth-items', 'interactive-webar',
  'architectural-3d-models', 'interior-3d-models',
]

function categoryRank(slug: string): number {
  const index = CATEGORY_ORDER.indexOf(slug.trim().toLowerCase())
  return index < 0 ? CATEGORY_ORDER.length : index
}

export function AllCategoriesPage() {
  const navigate = useNavigate()
  const categoriesQuery = useAllCategories()
  useDocumentSeo({
    title: CATEGORIES_SEO.title,
    description: CATEGORIES_SEO.description,
  })

  const categories = useMemo(() => {
    return [...(categoriesQuery.data ?? [])]
      .sort((a, b) =>
        categoryRank(a.slug) - categoryRank(b.slug) || a.name.localeCompare(b.name),
      )
  }, [categoriesQuery.data])

  return (
    <main className="all-categories-page" aria-label="All categories">
      {categoriesQuery.isPending ? (
        <Spinner label="Loading categories..." />
      ) : categoriesQuery.isError ? (
        <ErrorState
          title="Could not load categories"
          description="Please try loading the categories again."
          action={<Button onClick={() => categoriesQuery.refetch()}>Try again</Button>}
        />
      ) : categories.length === 0 ? (
        <p className="all-categories-page__empty" role="status">
          Categories will appear here as the catalog grows.
        </p>
      ) : (
        <div className="browse-category-grid" aria-label="All categories">
          {categories.map((category) => (
            <CategoryTile
              key={category.id}
              category={category}
              onSelect={() => {
                trackCategoryClick(category.id)
                navigate(`/3d-models?category=${encodeURIComponent(category.id)}`)
              }}
            />
          ))}
        </div>
      )}
    </main>
  )
}
