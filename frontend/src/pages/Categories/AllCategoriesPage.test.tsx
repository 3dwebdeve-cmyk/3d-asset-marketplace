import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as categoriesApi from '../../api/categoriesApi'
import { createTestQueryClient } from '../../test/test-utils'
import type { CategoryPublic } from '../../types/category'
import { AllCategoriesPage } from './AllCategoriesPage'

vi.mock('../../api/categoriesApi', () => ({
  listPublicCategories: vi.fn(),
  recordCategoryClick: vi.fn().mockResolvedValue({ id: 'x', click_count: 1 }),
}))

const categoryNames = [
  ['furniture', 'Furniture'], ['products', 'Products'], ['toys', 'Toys'],
  ['electronics', 'Electronics'], ['food-drink', 'Food & Drink'],
  ['character', 'Character'], ['industrial', 'Industrial'], ['household', 'Household'],
  ['plants-vegetation', 'Plants / Vegetation'], ['lights', 'Lights'],
  ['3d-printing', '3D Printing'], ['assets-props', 'Assets / Props'],
  ['lifestyle-visualisation', 'Lifestyle / Visualisation'], ['cloth-items', 'Cloth Items'],
  ['interactive-webar', 'Interactive / WebAR'],
  ['architectural-3d-models', 'Architectural 3D Models'],
  ['interior-3d-models', 'Interior 3D Models'],
]
// Furniture and interior come first on the page; the rest follow.
const displayOrder = [
  'furniture', 'interior-3d-models', 'household', 'lights', 'plants-vegetation',
  'lifestyle-visualisation', 'products', 'architectural-3d-models', 'interactive-webar',
  'electronics', 'food-drink', 'toys', 'character', 'assets-props', 'cloth-items',
  'industrial', '3d-printing',
]
const categories: CategoryPublic[] = categoryNames.map(([slug, name], index) => ({
  id: `category-${index}`, name, slug, description: '', image: '', parent: null,
  created_at: '2026-01-01T00:00:00Z',
}))

function ModelRoute() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

function renderPage() {
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={['/categories']}>
        <Routes>
          <Route path="/categories" element={<AllCategoriesPage />} />
          <Route path="/3d-models" element={<ModelRoute />} />
          <Route path="/3d-models/:categorySlug" element={<ModelRoute />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(categoriesApi.listPublicCategories).mockResolvedValue({
    count: categories.length, next: null, previous: null, results: categories,
  })
})

describe('AllCategoriesPage', () => {
  it('loads every page and renders all seventeen categories in reference order', async () => {
    const demo = { ...categories[0], id: 'demo', name: 'Demo Assets', slug: 'demo-assets' }
    vi.mocked(categoriesApi.listPublicCategories)
      .mockResolvedValueOnce({
        count: 18, next: '/api/v1/categories/?page=2', previous: null,
        results: [...categories.slice(0, 10)].reverse(),
      })
      .mockResolvedValueOnce({
        count: 18, next: null, previous: '/api/v1/categories/?page=1',
        results: [...categories.slice(10).reverse(), demo],
      })
    renderPage()

    await screen.findByRole('link', { name: /browse interior 3d models/i })
    expect(screen.getAllByRole('link').map((card) => card.textContent)).toEqual(
      displayOrder.map((slug) => categoryNames.find(([candidate]) => candidate === slug)![1]),
    )
    expect(categoriesApi.listPublicCategories).toHaveBeenNthCalledWith(2, {
      page: 2, page_size: 100,
    })
    expect(screen.queryByText('Demo Assets')).not.toBeInTheDocument()
  })

  it('links every category to its own readable address, which search engines can follow', async () => {
    const user = userEvent.setup()
    renderPage()
    const household = await screen.findByRole('link', { name: /browse household/i })
    expect(household).toHaveAttribute('href', '/3d-models/household')
    expect(screen.getByRole('link', { name: /browse interior 3d models/i })).toHaveAttribute(
      'href',
      '/3d-models/interior-3d-models',
    )
    await user.click(household)
    expect(screen.getByTestId('location')).toHaveTextContent('/3d-models/household')
    expect(categoriesApi.recordCategoryClick).toHaveBeenCalledWith('category-7')
  })

  it('has one descriptive heading and an introduction', async () => {
    renderPage()
    await screen.findByRole('link', { name: /browse household/i })
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('3D Model Categories')
    expect(screen.getByText(/start with furniture and interior 3D models/i)).toBeInTheDocument()
  })

  it('allows retry after the category API fails', async () => {
    const user = userEvent.setup()
    vi.mocked(categoriesApi.listPublicCategories).mockRejectedValueOnce(new Error('Offline'))
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load categories')
    await user.click(screen.getByRole('button', { name: /try again/i }))
    await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(17))
  })
})
