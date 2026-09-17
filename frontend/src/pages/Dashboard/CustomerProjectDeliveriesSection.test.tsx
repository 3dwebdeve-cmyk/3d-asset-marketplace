import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as customProjectsApi from '../../api/customProjectsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import type { ProjectDelivery } from '../../types/customProject'
import { CustomerProjectDeliveriesSection } from './CustomerProjectDeliveriesSection'

vi.mock('../../api/customProjectsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/customProjectsApi')>(
    '../../api/customProjectsApi',
  )
  return {
    ...actual,
    listCustomerProjectDeliveries: vi.fn(),
    downloadCustomerProjectDelivery: vi.fn(),
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
  download_url: `http://localhost/api/v1/custom-projects/${projectId}/deliveries/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb/download/`,
  created_at: '2026-01-10T10:00:00Z',
  updated_at: '2026-01-10T10:00:00Z',
}

function renderSection() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <CustomerProjectDeliveriesSection projectId={projectId} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
  vi.mocked(customProjectsApi.listCustomerProjectDeliveries).mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [delivery],
  })
})

describe('CustomerProjectDeliveriesSection', () => {
  it('lists deliverables with version, notes, size, and download', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.downloadCustomerProjectDelivery).mockResolvedValue()
    renderSection()

    expect(await screen.findByRole('heading', { name: 'Deliverables' })).toBeInTheDocument()
    expect(await screen.findByText('hero_v1.zip')).toBeInTheDocument()
    expect(screen.getByText(/Version 1/)).toBeInTheDocument()
    expect(screen.getByText(/First pass with baked lighting/)).toBeInTheDocument()
    expect(customProjectsApi.listCustomerProjectDeliveries).toHaveBeenCalledWith(projectId, {
      page: 1,
      page_size: 50,
    })

    await user.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => {
      expect(customProjectsApi.downloadCustomerProjectDelivery).toHaveBeenCalledWith(
        projectId,
        delivery.id,
        delivery.file_name,
      )
    })
  })

  it('shows empty state when no deliverables exist', async () => {
    vi.mocked(customProjectsApi.listCustomerProjectDeliveries).mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    })
    renderSection()

    expect(
      await screen.findByText(/no deliverables yet/i),
    ).toBeInTheDocument()
  })

  it('shows an alert when download fails', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.downloadCustomerProjectDelivery).mockRejectedValue(
      new Error('network down'),
    )
    renderSection()

    await user.click(await screen.findByRole('button', { name: 'Download' }))
    expect(
      await screen.findByText(/could not download the deliverable/i),
    ).toBeInTheDocument()
  })
})
