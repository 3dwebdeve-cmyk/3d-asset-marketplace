import { useQuery } from '@tanstack/react-query'
import { listPublicCategories } from '../api/categoriesApi'
import type { CategoryPublic } from '../types/category'

async function loadAllCategories(): Promise<CategoryPublic[]> {
  const categories: CategoryPublic[] = []
  let page = 1
  while (true) {
    const response = await listPublicCategories({ page, page_size: 100 })
    categories.push(...response.results)
    if (!response.next || response.results.length === 0) break
    page += 1
  }
  return [...new Map(categories.map((category) => [category.id, category])).values()]
    .filter((category) =>
      category.slug !== 'demo-assets' && category.name.trim().toLowerCase() !== 'demo assets',
    )
}

export function useAllCategories(enabled = true) {
  return useQuery({
    queryKey: ['public-categories-all'],
    queryFn: loadAllCategories,
    staleTime: 1000 * 60 * 5,
    enabled,
  })
}
