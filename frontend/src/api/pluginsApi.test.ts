import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from './client'
import { listAllAdminPluginCategories } from './pluginsApi'
import type { PluginCategory } from '../types/plugin'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

function category(id: string): PluginCategory {
  return {
    id,
    name: `Category ${id}`,
    slug: `category-${id}`,
    description: '',
    image: '',
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('pluginsApi', () => {
  it('loads every plugin-category page for selectors', async () => {
    vi.mocked(apiClient.get)
      .mockResolvedValueOnce({
        data: {
          count: 101,
          next: 'http://api.test/api/admin/plugin-categories/?page=2',
          previous: null,
          results: [category('1')],
        },
      })
      .mockResolvedValueOnce({
        data: {
          count: 101,
          next: null,
          previous: 'http://api.test/api/admin/plugin-categories/?page=1',
          results: [category('101')],
        },
      })

    const result = await listAllAdminPluginCategories()

    expect(result.map((item) => item.id)).toEqual(['1', '101'])
    expect(apiClient.get).toHaveBeenNthCalledWith(
      1,
      '/api/admin/plugin-categories/',
      { params: { page: 1, page_size: 100 } },
    )
    expect(apiClient.get).toHaveBeenNthCalledWith(
      2,
      '/api/admin/plugin-categories/',
      { params: { page: 2, page_size: 100 } },
    )
  })
})
