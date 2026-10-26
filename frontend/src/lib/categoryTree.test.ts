import { describe, expect, it } from 'vitest'

import type { CategoryPublic } from '../types/category'
import { buildCategoryTree } from './categoryTree'

function category(id: string, name: string, parent: CategoryPublic | null = null): CategoryPublic {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    description: '',
    image: '',
    parent: parent ? { id: parent.id, name: parent.name, slug: parent.slug } : null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

describe('buildCategoryTree', () => {
  const furniture = category('f', 'Furniture')
  const lights = category('l', 'Lights')
  const chair = category('c', 'Chair', furniture)
  const table = category('t', 'Table', furniture)
  const demo = category('d', 'Demo Assets')
  const demoChild = category('dc', 'Demo Chair', demo)

  it('nests subcategories under their parent in API order', () => {
    const tree = buildCategoryTree([chair, furniture, lights, table])
    expect(tree.map(({ category: c, children }) => [c.name, children.map((child) => child.name)])).toEqual([
      ['Furniture', ['Chair', 'Table']],
      ['Lights', []],
    ])
  })

  it('keeps a subcategory whose parent is not listed reachable at the top level', () => {
    const tree = buildCategoryTree([chair, lights])
    expect(tree.map(({ category: c }) => c.name)).toEqual(['Chair', 'Lights'])
  })

  it('drops the demo category and its subcategories when asked', () => {
    const tree = buildCategoryTree([furniture, demo, demoChild], { excludeDemo: true })
    expect(tree.map(({ category: c }) => c.name)).toEqual(['Furniture'])
    expect(buildCategoryTree([furniture, demo, demoChild])).toHaveLength(2)
  })
})
