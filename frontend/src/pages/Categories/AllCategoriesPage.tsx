import { useMemo } from 'react'
import { CategoryTile } from '../../components/CategoryTile'
import { Button } from '../../components/ui/Button'
import { ErrorState } from '../../components/ui/ErrorState'
import { Spinner } from '../../components/ui/Spinner'
import { useAllCategories } from '../../hooks/useAllCategories'
import { useDocumentSeo } from '../../hooks/useDocumentSeo'
import { buildBreadcrumbJsonLd, buildItemListJsonLd, buildPageTitle } from '../../lib/seo'
import { categoryPath, NOINDEX_CATEGORY_SLUGS } from '../../lib/categorySeo'
import { trackCategoryClick } from '../../lib/trackCategoryClick'
import '../../styles/products-browse.css'
import '../../styles/all-categories.css'

const CATEGORY_ORDER = [
  'furniture', 'interior-3d-models', 'household', 'lights', 'plants-vegetation',
  'lifestyle-visualisation', 'products', 'architectural-3d-models', 'interactive-webar',
  'electronics', 'food-drink', 'toys', 'character', 'assets-props', 'cloth-items',
  'industrial', '3d-printing',
]

function categoryRank(slug: string): number {
  const index = CATEGORY_ORDER.indexOf(slug.trim().toLowerCase())
  return index < 0 ? CATEGORY_ORDER.length : index
}

export function AllCategoriesPage() {
  const categoriesQuery = useAllCategories()

  const categories = useMemo(() => {
    return [...(categoriesQuery.data ?? [])]
      .sort((a, b) =>
        categoryRank(a.slug) - categoryRank(b.slug) || a.name.localeCompare(b.name),
      )
  }, [categoriesQuery.data])

  const listed = categories
    .filter((category) => !NOINDEX_CATEGORY_SLUGS.has(category.slug))
    .map((category) => ({ name: `${category.name} 3D models`, path: categoryPath(category.slug) }))
  useDocumentSeo({
    title: buildPageTitle('3D Model Categories: Furniture, Interior & More'),
    description:
      'Browse 3D model categories: furniture, interior, household, lighting, plants, products and more. ' +
      'Preview in 3D, secure checkout and instant download after purchase.',
    canonicalPath: '/categories',
    jsonLd: [
      buildBreadcrumbJsonLd([
        { name: 'Home', path: '/' },
        { name: 'Categories', path: '/categories' },
      ]),
      ...(listed.length > 0 ? [buildItemListJsonLd('3D model categories', listed)] : []),
    ],
  })

  return (
    <main className="all-categories-page" aria-label="All categories">
      <header className="all-categories-page__header">
        <h1 className="all-categories-page__title">3D Model Categories</h1>
        <p className="all-categories-page__intro">
          Start with furniture and interior 3D models, or browse household objects, lighting, plants, product
          visualization and more. Every category lists its models with formats and license details.
        </p>
      </header>
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
              onSelect={() => trackCategoryClick(category.id)}
            />
          ))}
        </div>
      )}
    </main>
  )
}
