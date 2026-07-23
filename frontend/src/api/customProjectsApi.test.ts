import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from './client'
import {
  createCustomerProjectMessage,
  getCustomerCustomProject,
  listCustomerCustomProjects,
  listCustomerProjectMessages,
} from './customProjectsApi'
import type { CustomerCustomProject, ProjectMessage } from '../types/customProject'

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

  it('propagates API failures from the customer message create request', async () => {
    vi.mocked(apiClient.post).mockRejectedValue(new Error('network'))

    await expect(
      createCustomerProjectMessage(projectId, { body: 'Need revision' }),
    ).rejects.toThrow('network')
  })
})
