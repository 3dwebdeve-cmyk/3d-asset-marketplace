import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as customProjectsApi from '../../api/customProjectsApi'
import { createTestQueryClient, resetAuthStore, resetToastStore } from '../../test/test-utils'
import type { CustomerCustomProject } from '../../types/customProject'
import { CustomerProjectReferenceFilesSection } from './CustomerProjectReferenceFilesSection'

vi.mock('../../api/customProjectsApi', async () => {
  const actual = await vi.importActual<typeof import('../../api/customProjectsApi')>(
    '../../api/customProjectsApi',
  )
  return {
    ...actual,
    uploadCustomerCustomProjectFile: vi.fn(),
    deleteCustomerCustomProjectFile: vi.fn(),
  }
})

const project: CustomerCustomProject = {
  id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  title: 'Hero prop',
  description: 'Stylized sci-fi crate with baked lighting.',
  category: 'Props',
  status: 'submitted',
  payment_status: 'unpaid',
  estimated_budget: '150.00',
  currency: 'USD',
  deadline: '2026-08-01',
  assigned_designer: null,
  quotation: null,
  files: [
    {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      file_type: 'reference_image',
      file_name: 'crate-ref.png',
      file_size: 2048,
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
    },
  ],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-15T12:00:00Z',
}

function renderSection(overrides: Partial<CustomerCustomProject> = {}) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <CustomerProjectReferenceFilesSection project={{ ...project, ...overrides }} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  resetAuthStore()
  resetToastStore()
  vi.clearAllMocks()
})

describe('CustomerProjectReferenceFilesSection', () => {
  it('lists existing reference files and uploads a new file', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.uploadCustomerCustomProjectFile).mockResolvedValue({
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      file_type: 'sketch',
      file_name: 'sketch.png',
      file_size: 1024,
      created_at: '2026-01-03T00:00:00Z',
      updated_at: '2026-01-03T00:00:00Z',
    })
    renderSection()

    expect(await screen.findByText('crate-ref.png')).toBeInTheDocument()
    expect(screen.getByLabelText('Upload reference file')).toBeInTheDocument()

    const file = new File(['png'], 'sketch.png', { type: 'image/png' })
    await user.selectOptions(screen.getByLabelText('File type'), 'sketch')
    await user.upload(screen.getByLabelText('Upload reference file'), file)
    await user.click(screen.getByRole('button', { name: 'Upload file' }))

    await waitFor(() => {
      expect(customProjectsApi.uploadCustomerCustomProjectFile).toHaveBeenCalledWith(
        project.id,
        expect.objectContaining({
          file,
          file_type: 'sketch',
        }),
        expect.any(Function),
      )
    })
  })

  it('hides upload form and remove buttons for closed projects', async () => {
    renderSection({ status: 'completed' })

    expect(await screen.findByText('crate-ref.png')).toBeInTheDocument()
    expect(screen.queryByLabelText('Upload reference file')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument()
  })

  it('shows remove button for open projects', async () => {
    renderSection({ status: 'submitted' })

    expect(await screen.findByText('crate-ref.png')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Remove crate-ref\.png/i })).toBeInTheDocument()
  })

  it('shows confirmation dialog on remove click', async () => {
    const user = userEvent.setup()
    renderSection({ status: 'submitted' })

    await user.click(await screen.findByRole('button', { name: /Remove crate-ref\.png/i }))

    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText(/Remove this reference file/i)).toBeInTheDocument()
  })

  it('calls delete API and invalidates query on confirm', async () => {
    const user = userEvent.setup()
    vi.mocked(customProjectsApi.deleteCustomerCustomProjectFile).mockResolvedValue(undefined)
    renderSection({ status: 'submitted' })

    await user.click(await screen.findByRole('button', { name: /Remove crate-ref\.png/i }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(customProjectsApi.deleteCustomerCustomProjectFile).toHaveBeenCalledWith(
        project.id,
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      )
    })
  })

  it('dismisses confirmation on cancel', async () => {
    const user = userEvent.setup()
    renderSection({ status: 'submitted' })

    await user.click(await screen.findByRole('button', { name: /Remove crate-ref\.png/i }))
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
