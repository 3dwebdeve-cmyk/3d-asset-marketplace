import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from './client'
import {
  createAdminProjectMessage,
  createCustomerProjectMessage,
  downloadAdminProjectDelivery,
  getCustomerCustomProject,
  listAdminProjectDeliveries,
  listAdminProjectMessages,
  listCustomerCustomProjects,
  listCustomerProjectMessages,
  markAdminProjectMessagesRead,
  markCustomerProjectMessagesRead,
  uploadAdminProjectDelivery,
} from './customProjectsApi'
import type {
  CustomerCustomProject,
  ProjectDelivery,
  ProjectMessage,
} from '../types/customProject'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

const projectId = '11111111-1111-1111-1111-111111111111'

const detail: CustomerCustomProject = {
  id: projectId,
  title: 'Hero prop',
  description: 'Stylized sci-fi crate with baked lighting.',
  category: 'Props',
  status: 'quoted',
  payment_status: 'unpaid',
  estimated_budget: '150.00',
  currency: 'USD',
  deadline: '2026-08-01',
  assigned_designer: null,
  quotation: null,
  files: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-15T12:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('customProjectsApi customer endpoints', () => {
  it('lists customer projects with default params (no query string)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    })

    await listCustomerCustomProjects()

    expect(apiClient.get).toHaveBeenCalledWith('/api/custom-projects/')
  })

  it('lists customer projects with pagination query params', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: {
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: projectId,
            title: 'Hero prop',
            category: 'Props',
            status: 'quoted',
            payment_status: 'unpaid',
            estimated_budget: '150.00',
            currency: 'USD',
            deadline: '2026-08-01',
            assigned_designer: null,
            quotation_amount: '175.00',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-15T12:00:00Z',
          },
        ],
      },
    })

    const result = await listCustomerCustomProjects({ page: 2, page_size: 20 })

    expect(apiClient.get).toHaveBeenCalledWith('/api/custom-projects/?page=2&page_size=20')
    expect(result.count).toBe(1)
    expect(result.results[0]?.title).toBe('Hero prop')
  })

  it('fetches a single customer project by id', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({ data: detail })

    const result = await getCustomerCustomProject(projectId)

    expect(apiClient.get).toHaveBeenCalledWith(`/api/custom-projects/${projectId}/`)
    expect(result).toEqual(detail)
  })

  it('propagates API failures from the customer detail request', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('network'))

    await expect(getCustomerCustomProject(projectId)).rejects.toThrow('network')
  })

  it('lists customer project messages with pagination params', async () => {
    const message: ProjectMessage = {
      id: '22222222-2222-2222-2222-222222222222',
      project_id: projectId,
      body: 'Hello studio',
      sender: { id: '33333333-3333-3333-3333-333333333333', full_name: 'Ada' },
      attachments: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { count: 1, next: null, previous: null, results: [message] },
    })

    const result = await listCustomerProjectMessages(projectId, {
      page: 1,
      page_size: 100,
    })

    expect(apiClient.get).toHaveBeenCalledWith(
      `/api/custom-projects/${projectId}/messages/?page=1&page_size=100`,
    )
    expect(result.results[0]?.body).toBe('Hello studio')
  })

  it('lists customer project messages with default params (no query string)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    })

    await listCustomerProjectMessages(projectId)

    expect(apiClient.get).toHaveBeenCalledWith(
      `/api/custom-projects/${projectId}/messages/`,
    )
  })

  it('propagates API failures from the customer messages list request', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('network'))

    await expect(listCustomerProjectMessages(projectId)).rejects.toThrow('network')
  })

  it('creates a customer project message', async () => {
    const message: ProjectMessage = {
      id: '22222222-2222-2222-2222-222222222222',
      project_id: projectId,
      body: 'Need revision',
      sender: { id: '33333333-3333-3333-3333-333333333333', full_name: 'Ada' },
      attachments: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    vi.mocked(apiClient.post).mockResolvedValue({ data: message })

    const result = await createCustomerProjectMessage(projectId, {
      body: 'Need revision',
    })

    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/custom-projects/${projectId}/messages/`,
      { body: 'Need revision' },
    )
    expect(result).toEqual(message)
  })

  it('creates a customer project message with multipart attachment', async () => {
    const file = new File(['png'], 'sketch.png', { type: 'image/png' })
    const message: ProjectMessage = {
      id: '22222222-2222-2222-2222-222222222222',
      project_id: projectId,
      body: 'See sketch',
      sender: { id: '33333333-3333-3333-3333-333333333333', full_name: 'Ada' },
      attachments: [
        {
          id: '44444444-4444-4444-4444-444444444444',
          file_name: 'sketch.png',
          file_size: 3,
          download_url: `/api/custom-projects/${projectId}/messages/22222222-2222-2222-2222-222222222222/attachments/44444444-4444-4444-4444-444444444444/download/`,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    vi.mocked(apiClient.post).mockResolvedValue({ data: message })

    const result = await createCustomerProjectMessage(projectId, {
      body: 'See sketch',
      file,
    })

    expect(apiClient.post).toHaveBeenCalledTimes(1)
    const [, payload] = vi.mocked(apiClient.post).mock.calls[0] ?? []
    expect(payload).toBeInstanceOf(FormData)
    const formData = payload as FormData
    expect(formData.get('body')).toBe('See sketch')
    expect(formData.get('file')).toBe(file)
    expect(result.attachments).toHaveLength(1)
  })

  it('propagates API failures from the customer message create request', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('network'))

    await expect(
      createCustomerProjectMessage(projectId, { body: 'Need revision' }),
    ).rejects.toThrow('network')
  })

  it('marks customer project messages as read', async () => {
    const readState = {
      project_id: projectId,
      last_read_at: '2026-01-10T12:00:00Z',
      unread_count: 0,
    }
    vi.mocked(apiClient.post).mockResolvedValue({ data: readState })

    const result = await markCustomerProjectMessagesRead(projectId)

    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/custom-projects/${projectId}/messages/read/`,
    )
    expect(result).toEqual(readState)
  })
})

describe('customProjectsApi admin message endpoints', () => {
  it('lists admin project messages with pagination params', async () => {
    const message: ProjectMessage = {
      id: '22222222-2222-2222-2222-222222222222',
      project_id: projectId,
      body: 'We can deliver next week',
      sender: { id: '33333333-3333-3333-3333-333333333333', full_name: 'Admin' },
      attachments: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { count: 1, next: null, previous: null, results: [message] },
    })

    const result = await listAdminProjectMessages(projectId, {
      page: 1,
      page_size: 100,
    })

    expect(apiClient.get).toHaveBeenCalledWith(
      `/api/admin/custom-projects/${projectId}/messages/?page=1&page_size=100`,
    )
    expect(result.results[0]?.body).toBe('We can deliver next week')
  })

  it('lists admin project messages with default params (no query string)', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { count: 0, next: null, previous: null, results: [] },
    })

    await listAdminProjectMessages(projectId)

    expect(apiClient.get).toHaveBeenCalledWith(
      `/api/admin/custom-projects/${projectId}/messages/`,
    )
  })

  it('propagates API failures from the admin messages list request', async () => {
    vi.mocked(apiClient.get).mockRejectedValue(new Error('network'))

    await expect(listAdminProjectMessages(projectId)).rejects.toThrow('network')
  })

  it('creates an admin project message', async () => {
    const message: ProjectMessage = {
      id: '22222222-2222-2222-2222-222222222222',
      project_id: projectId,
      body: 'Please share the CAD file',
      sender: { id: '33333333-3333-3333-3333-333333333333', full_name: 'Admin' },
      attachments: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    }
    vi.mocked(apiClient.post).mockResolvedValue({ data: message })

    const result = await createAdminProjectMessage(projectId, {
      body: 'Please share the CAD file',
    })

    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/admin/custom-projects/${projectId}/messages/`,
      { body: 'Please share the CAD file' },
    )
    expect(result).toEqual(message)
  })

  it('propagates API failures from the admin message create request', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('network'))

    await expect(
      createAdminProjectMessage(projectId, { body: 'Please share the CAD file' }),
    ).rejects.toThrow('network')
  })

  it('marks admin project messages as read', async () => {
    const readState = {
      project_id: projectId,
      last_read_at: '2026-01-10T12:00:00Z',
      unread_count: 0,
    }
    vi.mocked(apiClient.post).mockResolvedValue({ data: readState })

    const result = await markAdminProjectMessagesRead(projectId)

    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/admin/custom-projects/${projectId}/messages/read/`,
    )
    expect(result).toEqual(readState)
  })
})

describe('customProjectsApi admin delivery endpoints', () => {
  const delivery: ProjectDelivery = {
    id: '55555555-5555-5555-5555-555555555555',
    project_id: projectId,
    file_name: 'final.zip',
    file_size: 4096,
    version: 1,
    notes: 'Ready for review',
    uploaded_by_email: 'admin@example.com',
    download_url: `http://localhost/api/admin/custom-projects/${projectId}/deliveries/55555555-5555-5555-5555-555555555555/download/`,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }

  it('lists admin project deliveries with pagination params', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { count: 1, next: null, previous: null, results: [delivery] },
    })

    const result = await listAdminProjectDeliveries(projectId, {
      page: 1,
      page_size: 50,
    })

    expect(apiClient.get).toHaveBeenCalledWith(
      `/api/admin/custom-projects/${projectId}/deliveries/?page=1&page_size=50`,
    )
    expect(result.results[0]?.file_name).toBe('final.zip')
  })

  it('uploads an admin project delivery via multipart form data', async () => {
    const file = new File(['zip'], 'final.zip', { type: 'application/zip' })
    vi.mocked(apiClient.post).mockResolvedValue({ data: delivery })

    const result = await uploadAdminProjectDelivery(projectId, {
      file,
      notes: 'Ready for review',
      version: 1,
    })

    expect(apiClient.post).toHaveBeenCalledWith(
      `/api/admin/custom-projects/${projectId}/deliveries/`,
      expect.any(FormData),
    )
    const [, payload] = vi.mocked(apiClient.post).mock.calls[0] ?? []
    expect(payload).toBeInstanceOf(FormData)
    const formData = payload as FormData
    expect(formData.get('file')).toBe(file)
    expect(formData.get('notes')).toBe('Ready for review')
    expect(formData.get('version')).toBe('1')
    expect(result).toEqual(delivery)
  })

  it('downloads an admin project delivery as a blob', async () => {
    const click = vi.fn()
    const revokeObjectURL = vi.fn()
    const createObjectURL = vi.fn(() => 'blob:delivery')
    vi.stubGlobal('URL', {
      createObjectURL,
      revokeObjectURL,
    })
    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return { click, download: '', href: '' } as unknown as HTMLAnchorElement
      }
      return originalCreateElement(tagName)
    })
    vi.mocked(apiClient.get).mockResolvedValue({ data: new Blob(['zip']) })

    await downloadAdminProjectDelivery(projectId, delivery.id, delivery.file_name)

    expect(apiClient.get).toHaveBeenCalledWith(
      `/api/admin/custom-projects/${projectId}/deliveries/${delivery.id}/download/`,
      { responseType: 'blob' },
    )
    expect(createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:delivery')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
})
