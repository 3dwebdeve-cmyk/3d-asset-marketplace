import { apiClient } from './client'
import type {
  AdminCustomProject,
  AdminCustomProjectCreatePayload,
  AdminCustomProjectListParams,
  AdminCustomProjectUpdatePayload,
  PaginatedCustomProjects,
  ProjectQuotationUpsertPayload,
  ProjectQuotationUpsertResponse,
} from '../types/customProject'

function toQuery(params: AdminCustomProjectListParams = {}): string {
  const query = new URLSearchParams()
  if (params.search) query.set('search', params.search)
  if (params.status) query.set('status', params.status)
  if (params.payment_status) query.set('payment_status', params.payment_status)
  if (params.customer_id) query.set('customer_id', params.customer_id)
  if (params.ordering) query.set('ordering', params.ordering)
  if (params.page) query.set('page', String(params.page))
  if (params.page_size) query.set('page_size', String(params.page_size))
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export async function listAdminCustomProjects(
  params: AdminCustomProjectListParams = {},
): Promise<PaginatedCustomProjects> {
  const { data } = await apiClient.get<PaginatedCustomProjects>(
    `/api/admin/custom-projects/${toQuery(params)}`,
  )
  return data
}

export async function getAdminCustomProject(
  projectId: string,
): Promise<AdminCustomProject> {
  const { data } = await apiClient.get<AdminCustomProject>(
    `/api/admin/custom-projects/${projectId}/`,
  )
  return data
}

export async function createAdminCustomProject(
  payload: AdminCustomProjectCreatePayload,
): Promise<AdminCustomProject> {
  const { data } = await apiClient.post<AdminCustomProject>(
    '/api/admin/custom-projects/',
    payload,
  )
  return data
}

export async function updateAdminCustomProject(
  projectId: string,
  payload: AdminCustomProjectUpdatePayload,
): Promise<AdminCustomProject> {
  const { data } = await apiClient.patch<AdminCustomProject>(
    `/api/admin/custom-projects/${projectId}/`,
    payload,
  )
  return data
}

export async function upsertAdminCustomProjectQuotation(
  projectId: string,
  payload: ProjectQuotationUpsertPayload,
): Promise<ProjectQuotationUpsertResponse> {
  const { data } = await apiClient.post<ProjectQuotationUpsertResponse>(
    `/api/admin/custom-projects/${projectId}/quotation/`,
    payload,
  )
  return data
}
