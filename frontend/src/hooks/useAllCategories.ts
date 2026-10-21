import { queryOptions, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { listPublicCategories } from '../api/categoriesApi'
import type { CategoryPublic } from '../types/category'

const CATEGORY_PAGE_SIZE = 100

/**
 * The first page of categories. The navbar menu, the 3D models page and useAllCategories all share
 * this one query, so a page that shows several of them asks the server only once.
 */
export const firstCategoriesPageQuery = queryOptions({
  queryKey: ['public-categories-list', { page_size: CATEGORY_PAGE_SIZE }],
  queryFn: () => listPublicCategories({ page_size: CATEGORY_PAGE_SIZE }),
  staleTime: 1000 * 60 * 5,
})

async function loadAllCategories(queryClient: QueryClient): Promise<CategoryPublic[]> {
  // fetchQuery reuses the shared first page when it is already loaded or on its way.
  const firstPage = await queryClient.fetchQuery(firstCategoriesPageQuery)
  const categories: CategoryPublic[] = [...firstPage.results]
  let hasMore = Boolean(firstPage.next) && firstPage.results.length > 0
  let page = 2
  while (hasMore) {
    const response = await listPublicCategories({ page, page_size: CATEGORY_PAGE_SIZE })
    categories.push(...response.results)
    hasMore = Boolean(response.next) && response.results.length > 0
    page += 1
  }
  return [...new Map(categories.map((category) => [category.id, category])).values()]
    .filter((category) =>
      category.slug !== 'demo-assets' && category.name.trim().toLowerCase() !== 'demo assets',
    )
}

export function useAllCategories(enabled = true) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['public-categories-all'],
    queryFn: () => loadAllCategories(queryClient),
    staleTime: 1000 * 60 * 5,
    enabled,
  })
}
