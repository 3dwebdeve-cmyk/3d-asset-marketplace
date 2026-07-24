import { QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as customProjectsApi from '../../api/customProjectsApi'
import {
  createTestQueryClient,
  resetAuthStore,
  resetToastStore,
} from '../../test/test-utils'
import type { ProjectDelivery } from '../../types/customProject'
import { AdminProjectDeliveriesSection } from './AdminProjectDeliveriesSection'

vi.mock('../../api/customProjectsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/customProjectsApi')>(
    '../../api/customProjectsApi',
  )
  return {
    ...actual,
    listAdminProjectDeliveries: vi.fn(),
    uploadAdminProjectDelivery: vi.fn(),
    downloadAdminProjectDelivery: vi.fn(),
    updateAdminCustomProject: vi.fn(),
  }
})

const projectId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const delivery: ProjectDelivery = {
  id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  project_id: projectId,
  file_name: 'hero_v1.zip',
  file_size: 2048,
  version: 1,
  notes: 'First pass with baked lighting.',
  uploaded_by_email: 'admin@example.com',
  download_url: `http://localhost/api/admin/custom-projects/${projectId}/deliveries/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/download/`,
  created_at: '2026-01-10T10:00:00Z',
  updated_at: '2026-01-10T10:00:00Z',
}

function renderSection(
  status: 'submitted' | 'in_progress' | 'delivered' | 'completed' = 'in_progress',
  onStatusChange = vi.fn(),
) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <AdminProjectDeliveriesSection
        projectId={projectId}
        status={status}
        onStatusChange={onStatusChange}
      />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
  vi.mocked(customProjectsApi.listAdminProjectDeliveries).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [delivery],
  })
})

describe('AdminProjectDeliveriesSection', () => {
  it('lists deliverables with name, version, notes, size, and download', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.downloadAdminProjectDelivery).mockResolvedValue()
    renderSection()

    expect(await screen.findByRole('heading', { name: 'Deliverables' })).toBeInTheDocument()
    expect(await screen.findByText('hero_v1.zip')).toBeInTheDocument()
    expect(screen.getByText(/Version 1/)).toBeInTheDocument()
    expect(screen.getByText(/First pass with baked lighting/)).toBeInTheDocument()
    expect(customProjectsApi.listAdminProjectDeliveries).toHaveBeenCalledWith(projectId, {
      page: 1,
      page_size: 50,
    })

    await user.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => {
      expect(customProjectsApi.downloadAdminProjectDelivery).toHaveBeenCalledWith(
        projectId,
        delivery.id,
        delivery.file_name,
      )
    })
  })

  it('uploads a deliverable with optional notes', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.uploadAdminProjectDelivery).mockResolvedValue({
      ...delivery,
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      version: 2,
      file_name: 'hero_v2.zip',
      notes: 'Revision round',
    })
    renderSection()
    await screen.findByText('hero_v1.zip')

    const file = new File(['zip-bytes'], 'hero_v2.zip', { type: 'application/zip' })
    await user.upload(screen.getByLabelText('Upload deliverable'), file)
    await user.type(screen.getByLabelText('Notes (optional)'), 'Revision round')
    await user.click(screen.getByRole('button', { name: 'Upload deliverable' }))

    await waitFor(() => {
      expect(customProjectsApi.uploadAdminProjectDelivery).toHaveBeenCalledWith(
        projectId,
        expect.objectContaining({
          file,
          notes: 'Revision round',
        }),
      )
    })
  })

  it('rejects invalid upload file types client-side', async () => {
    renderSection()
    await screen.findByText('hero_v1.zip')

    const file = new File(['MZ'], 'malware.exe', { type: 'application/octet-stream' })
    fireEvent.change(screen.getByLabelText('Upload deliverable'), {
      target: { files: [file] },
    })

    expect(await screen.findByText(/invalid file type/i)).toBeInTheDocument()
    expect(customProjectsApi.uploadAdminProjectDelivery).not.toHaveBeenCalled()
  })

  it('marks project delivered when in progress', async () => {
    const user = userEvent.setup()
    const onStatusChange = vi.fn()
    vi.mocked(customProjectsApi.updateAdminCustomProject).mockResolvedValue({
      id: projectId,
      title: 'Hero prop',
      description: 'Stylized sci-fi crate with baked lighting.',
      category: 'Props',
      status: 'delivered',
      payment_status: 'paid',
      estimated_budget: '150.00',
      currency: 'USD',
      deadline: null,
      admin_notes: '',
      customer: {
        id: '22222222-2222-2222-2222-222222222222',
        email: 'customer@example.com',
        full_name: 'Ada Customer',
      },
      assigned_designer: null,
      quotation_amount: null,
      quotation: null,
      files: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    renderSection('in_progress', onStatusChange)

    await user.click(await screen.findByRole('button', { name: 'Mark delivered' }))
    await waitFor(() => {
      expect(customProjectsApi.updateAdminCustomProject).toHaveBeenCalledWith(projectId, {
        status: 'delivered',
      })
    })
    expect(onStatusChange).toHaveBeenCalledWith('delivered')
  })

  it('disables mark delivered when status is not in progress', async () => {
    renderSection('submitted')
    expect(await screen.findByRole('button', { name: 'Mark delivered' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Mark completed' })).toBeDisabled()
  })

  it('marks project completed when delivered', async () => {
    const user = userEvent.setup()
    const onStatusChange = vi.fn()
    vi.mocked(customProjectsApi.updateAdminCustomProject).mockResolvedValue({
      id: projectId,
      title: 'Hero prop',
      description: 'Stylized sci-fi crate with baked lighting.',
      category: 'Props',
      status: 'completed',
      payment_status: 'paid',
      estimated_budget: '150.00',
      currency: 'USD',
      deadline: null,
      admin_notes: '',
      customer: {
        id: '22222222-2222-2222-2222-222222222222',
        email: 'customer@example.com',
        full_name: 'Ada Customer',
      },
      assigned_designer: null,
      quotation_amount: null,
      quotation: null,
      files: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    })
    renderSection('delivered', onStatusChange)

    await user.click(await screen.findByRole('button', { name: 'Mark completed' }))
    await waitFor(() => {
      expect(customProjectsApi.updateAdminCustomProject).toHaveBeenCalledWith(projectId, {
        status: 'completed',
      })
    })
    expect(onStatusChange).toHaveBeenCalledWith('completed')
  })
})
