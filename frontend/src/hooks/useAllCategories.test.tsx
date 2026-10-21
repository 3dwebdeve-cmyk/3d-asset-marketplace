import { QueryClientProvider, useQuery } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { listPublicCategories } from '../api/categoriesApi'
import { createTestQueryClient } from '../test/test-utils'
import type { CategoryPublic } from '../types/category'
import { firstCategoriesPageQuery, useAllCategories } from './useAllCategories'

vi.mock('../api/categoriesApi', () => ({ listPublicCategories: vi.fn() }))

function category(id: string, name: string): CategoryPublic {
  return { id, name, slug: name.toLowerCase().replace(/ /g, '-') } as CategoryPublic
}

function page(results: CategoryPublic[], next: string | null) {
  return { count: 0, next, previous: null, results }
}

// Like the navbar: shows the first page of categories.
function MenuCategories() {
  const { data } = useQuery(firstCategoriesPageQuery)
  return <p>menu: {data?.results.length ?? 'loading'}</p>
}

// Like the home page: shows every category.
function AllCategories() {
  const { data } = useAllCategories()
  return <p>all: {data?.map((item) => item.name).join(', ') ?? 'loading'}</p>
}

function renderBoth() {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MenuCategories />
      <AllCategories />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.mocked(listPublicCategories).mockReset()
})

describe('useAllCategories', () => {
  it('shares the first page with the navbar menu, so the server is asked once', async () => {
    vi.mocked(listPublicCategories).mockResolvedValue(
      page([category('1', 'Chairs'), category('2', 'Demo assets'), category('3', 'Lamps')], null),
    )

    renderBoth()

    expect(await screen.findByText('all: Chairs, Lamps')).toBeInTheDocument()
    expect(screen.getByText('menu: 3')).toBeInTheDocument()
    expect(listPublicCategories).toHaveBeenCalledTimes(1)
  })

  it('still fetches the later pages when there are more than one page of categories', async () => {
    vi.mocked(listPublicCategories).mockImplementation(async (params) =>
      params?.page === 2
        ? page([category('3', 'Lamps')], null)
        : page([category('1', 'Chairs'), category('2', 'Tables')], 'next-page'),
    )

    renderBoth()

    expect(await screen.findByText('all: Chairs, Tables, Lamps')).toBeInTheDocument()
    expect(listPublicCategories).toHaveBeenCalledTimes(2)
    expect(vi.mocked(listPublicCategories).mock.calls[1]?.[0]).toEqual({ page: 2, page_size: 100 })
  })
})
