import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { ProductMediaSection } from './ProductMediaSection'
import { uploadProductFile } from '../../api/productsApi'

vi.mock('../../components/viewer/ModelViewer', () => ({
  default: ({ modelUrl }: { modelUrl: string }) => <div data-testid="admin-model-viewer">{modelUrl}</div>,
}))

vi.mock('../../api/productsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/productsApi')>(
    '../../api/productsApi',
  )
  return {
    ...actual,
    uploadProductImage: vi.fn(),
    uploadProductFile: vi.fn(),
    deleteProductImage: vi.fn(),
    deleteProductFile: vi.fn(),
  }
})

const productId = 'b3d66e20-e133-4506-a6c5-a47d2ee5cd00'

const sampleProduct = {
  id: productId,
  name: 'Oak Chair',
  slug: 'oak-chair',
  sku: null,
  import_batch_id: '',
  import_source: '',
  glb_checksum: '',
  has_thumbnail: true,
  has_preview: false,
  has_package: false,
  description: 'A wooden chair',
  short_description: 'Wooden chair',
  price: '29.99',
  currency: 'USD',
  discount_price: null,
  thumbnail: 'http://127.0.0.1:8000/media/products/images/thumb.png',
  preview_model: '',
  preview_video: '',
  polygon_count: null,
  vertex_count: null,
  software_used: 'Blender',
  animated: false,
  rigged: false,
  pbr_ready: true,
  game_ready: false,
  license_type: 'standard' as const,
  average_rating: '0.00',
  review_count: 0,
  total_downloads: 0,
  status: 'draft' as const,
  reject_reason: '',
  qa_notes: '',
  reviewed_at: null,
  reviewed_by: null,
  category: { id: '44bba207-8a0c-490d-abdf-5a383ed2111b', name: 'Furniture', slug: 'furniture' },
  images: [
    {
      id: '11111111-1111-1111-1111-111111111111',
      image_url: 'http://127.0.0.1:8000/media/products/images/thumb.png',
      display_order: 0,
      is_primary: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ],
  files: [
    {
      id: '22222222-2222-2222-2222-222222222222',
      file_name: 'chair.usdz',
      file_format: 'usdz',
      file_size: 2048,
      storage_path: 'http://127.0.0.1:8000/media/products/files/chair.usdz',
      version: '1.0',
      is_preview: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

function renderMediaSection(product = sampleProduct) {
  const queryClient = createTestQueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <ProductMediaSection productId={productId} product={product} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
})

describe('ProductMediaSection', () => {
  it('shows the saved preview in the admin viewer, including draft products', async () => {
    const preview_model = 'https://cdn.example.com/chair.glb'
    renderMediaSection({ ...sampleProduct, preview_model })
    expect(await screen.findByTestId('admin-model-viewer')).toHaveTextContent(preview_model)
  })

  it('explains preview requirements before a model is uploaded', () => {
    renderMediaSection()
    expect(screen.getByText(/Upload a GLB or self-contained GLTF/)).toBeInTheDocument()
  })

  it('rejects oversized previews before sending the upload', () => {
    renderMediaSection()
    const file = new File(['model'], 'chair.glb')
    Object.defineProperty(file, 'size', { value: 13 * 1024 * 1024 })
    fireEvent.change(document.getElementById('product-file-upload')!, { target: { files: [file] } })
    expect(screen.getByRole('alert')).toHaveTextContent('Preview model must be 12 MB or smaller.')
    expect(uploadProductFile).not.toHaveBeenCalled()
  })

  it('shows supported format badges and uploaded media details', async () => {
    renderMediaSection()

    expect(screen.getAllByText('USDZ').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('GLB')).toBeInTheDocument()
    expect(screen.getByText('FBX')).toBeInTheDocument()
    expect(screen.getByText('Primary thumbnail')).toBeInTheDocument()
    expect(screen.getByText('chair.usdz')).toBeInTheDocument()
    expect(screen.getByText(/2\.0 KB/)).toBeInTheDocument()

    const fileInput = document.getElementById('product-file-upload')
    expect(fileInput).toHaveAttribute('accept', expect.stringContaining('.usdz'))
  })
})
