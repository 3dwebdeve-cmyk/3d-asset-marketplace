import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import { ProductMediaSection } from './ProductMediaSection'
import { uploadProductFile } from '../../api/productsApi'
import type { AdminProduct } from '../../types/product'

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
  category: { id: '44bba207-8a0c-490d-abdf-5a383ed2111b', name: 'Furniture', slug: 'furniture', code: null, is_active: true, pending_approval: false, rejected_at: null },
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
      package_kind: '' as const,
      package_label: '',
      price: null,
      discount_price: null,
      discount_ends_at: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ],
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

function renderMediaSection(product: AdminProduct = sampleProduct) {
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
    expect(screen.getByText(/upload a GLB or self-contained GLTF/)).toBeInTheDocument()
  })

  it('rejects oversized previews before sending the upload', () => {
    renderMediaSection()
    const file = new File(['model'], 'chair.glb')
    Object.defineProperty(file, 'size', { value: 26 * 1024 * 1024 })
    fireEvent.change(document.getElementById('product-file-upload')!, { target: { files: [file] } })
    expect(screen.getByRole('alert')).toHaveTextContent('Preview model must be 25 MB or smaller.')
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

  it('shows the 360° frames in a small viewer, or says there is no 360', () => {
    const spin_images = Array.from({ length: 36 }, (_, index) => `https://cdn.example.com/360/X/${index + 1}.jpg`)
    const { unmount } = renderMediaSection({ ...sampleProduct, spin_images })
    expect(screen.getByText(/360: 36 frames/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '360° view of Oak Chair' })).toBeInTheDocument()
    unmount()

    renderMediaSection({ ...sampleProduct, spin_images: [] })
    expect(screen.getByText(/No 360/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: '360° view of Oak Chair' })).not.toBeInTheDocument()
  })

  it('says a model with a 360 and no GLB has no 3D preview instead of an empty viewer', () => {
    const spin_images = Array.from({ length: 36 }, (_, index) => `https://cdn.example.com/360/X/${index + 1}.jpg`)
    renderMediaSection({ ...sampleProduct, preview_model: '', spin_images })
    expect(screen.getByText(/No 3D preview - 360 only/)).toBeInTheDocument()
    expect(screen.queryByTestId('admin-model-viewer')).not.toBeInTheDocument()
  })

  it('lists the packages in order with their file, size and download link', () => {
    const packageRow = (kind: 'whole' | 'with_light_rig', label: string, size: number) => ({
      ...sampleProduct.files[0],
      id: `pkg-${kind}`,
      file_name: `ELE-000001_${kind}.zip`,
      file_format: 'zip',
      file_size: size,
      storage_path: `https://cdn.example.com/${kind}.zip`,
      package_kind: kind,
      package_label: label,
    })
    renderMediaSection({
      ...sampleProduct,
      files: [packageRow('whole', 'Whole File', 4096), packageRow('with_light_rig', 'With Light Rig', 2048)],
    })

    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map((row) => row.querySelector('th')?.textContent)).toEqual(['With Light Rig', 'Whole File'])
    expect(rows[1]).toHaveTextContent('ELE-000001_whole.zip')
    expect(rows[1]).toHaveTextContent('4.0 KB')
    expect(within(rows[1]).getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      'https://cdn.example.com/whole.zip',
    )
    // A package kind the model already has cannot be chosen again.
    const picker = screen.getByLabelText(/^Package/)
    expect(within(picker).queryByRole('option', { name: 'Whole File' })).not.toBeInTheDocument()
    expect(within(picker).getByRole('option', { name: 'GLB Only' })).toBeInTheDocument()
  })

  it('asks which package a zip is before uploading it, then sends the kind', async () => {
    vi.mocked(uploadProductFile).mockResolvedValue(sampleProduct.files[0])
    renderMediaSection()
    const zip = new File(['PK'], 'chair.zip')
    const input = document.getElementById('product-file-upload')!

    fireEvent.change(input, { target: { files: [zip] } })
    expect(screen.getByRole('alert')).toHaveTextContent('Choose which package this file is')
    expect(uploadProductFile).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/^Package/), { target: { value: 'glb_only' } })
    fireEvent.change(input, { target: { files: [zip] } })
    await waitFor(() =>
      expect(uploadProductFile).toHaveBeenCalledWith(
        productId,
        expect.objectContaining({ file: zip, is_preview: false, package_kind: 'glb_only' }),
      ),
    )
  })
})
