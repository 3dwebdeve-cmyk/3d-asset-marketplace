import type { CategoryPublic } from '../types/category'

export interface CategoryTreeNode {
  category: CategoryPublic
  children: CategoryPublic[]
}

// The internal demo category stays out of customer-facing navigation.
export function isDemoCategory(category: Pick<CategoryPublic, 'slug' | 'name'>): boolean {
  return category.slug === 'demo-assets' || category.name.trim().toLowerCase() === 'demo assets'
}

/**
 * Group categories as top-level entries with their subcategories nested under them,
 * keeping the API order. A subcategory whose parent is not listed (for example an
 * inactive parent) becomes a top-level entry so it stays reachable.
 */
export function buildCategoryTree(
  categories: readonly CategoryPublic[],
  { excludeDemo = false }: { excludeDemo?: boolean } = {},
): CategoryTreeNode[] {
  const visible = excludeDemo ? categories.filter((category) => !isDemoCategory(category)) : categories
  const visibleIds = new Set(visible.map((category) => category.id))
  const excludedIds = new Set(
    categories.filter((category) => !visibleIds.has(category.id)).map((category) => category.id),
  )
  const childrenByParent = new Map<string, CategoryPublic[]>()
  const roots: CategoryPublic[] = []

  for (const category of visible) {
    const parentId = category.parent?.id
    if (parentId && excludedIds.has(parentId)) continue
    if (parentId && visibleIds.has(parentId)) {
      childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), category])
    } else {
      roots.push(category)
    }
  }

  return roots.map((category) => ({
    category,
    children: childrenByParent.get(category.id) ?? [],
  }))
}
