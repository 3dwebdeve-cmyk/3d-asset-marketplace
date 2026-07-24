import { apiClient } from './client'
import type {
  AdminCustomProject,
  AdminCustomProjectCreatePayload,
  AdminCustomProjectListParams,
  AdminCustomProjectUpdatePayload,
  CustomerCustomProject,
  CustomerCustomProjectListParams,
  PaginatedCustomerCustomProjects,
  PaginatedCustomProjects,
  PaginatedProjectDeliveries,
  PaginatedProjectMessages,
  ProjectDelivery,
  ProjectDeliveryListParams,
  ProjectDeliveryUploadPayload,
  ProjectMessage,
  ProjectMessageCreatePayload,
  ProjectMessageListParams,
  ProjectMessageReadState,
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

function toCustomerListQuery(params: CustomerCustomProjectListParams = {}): string {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.page_size) query.set('page_size', String(params.page_size))
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export async function listCustomerCustomProjects(
  params: CustomerCustomProjectListParams = {},
): Promise<PaginatedCustomerCustomProjects> {
  const { data } = await apiClient.get<PaginatedCustomerCustomProjects>(
    `/api/custom-projects/${toCustomerListQuery(params)}`,
  )
  return data
}

export async function getCustomerCustomProject(
  projectId: string,
): Promise<CustomerCustomProject> {
  const { data } = await apiClient.get<CustomerCustomProject>(
    `/api/custom-projects/${projectId}/`,
  )
  return data
}

function toMessageListQuery(params: ProjectMessageListParams = {}): string {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.page_size) query.set('page_size', String(params.page_size))
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export async function listCustomerProjectMessages(
  projectId: string,
  params: ProjectMessageListParams = {},
): Promise<PaginatedProjectMessages> {
  const { data } = await apiClient.get<PaginatedProjectMessages>(
    `/api/custom-projects/${projectId}/messages/${toMessageListQuery(params)}`,
  )
  return data
}

export async function createCustomerProjectMessage(
  projectId: string,
  payload: ProjectMessageCreatePayload,
): Promise<ProjectMessage> {
  if (payload.file) {
    const formData = new FormData()
    formData.append('body', payload.body)
    formData.append('file', payload.file)
    const { data } = await apiClient.post<ProjectMessage>(
      `/api/custom-projects/${projectId}/messages/`,
      formData,
    )
    return data
  }
  const { data } = await apiClient.post<ProjectMessage>(
    `/api/custom-projects/${projectId}/messages/`,
    { body: payload.body },
  )
  return data
}

export async function downloadCustomerProjectMessageAttachment(
  projectId: string,
  messageId: string,
  attachmentId: string,
  fileName: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    `/api/custom-projects/${projectId}/messages/${messageId}/attachments/${attachmentId}/download/`,
    { responseType: 'blob' },
  )
  const objectUrl = URL.createObjectURL(data)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}

export async function markCustomerProjectMessagesRead(
  projectId: string,
): Promise<ProjectMessageReadState> {
  const { data } = await apiClient.post<ProjectMessageReadState>(
    `/api/custom-projects/${projectId}/messages/read/`,
  )
  return data
}

export async function listAdminProjectMessages(
  projectId: string,
  params: ProjectMessageListParams = {},
): Promise<PaginatedProjectMessages> {
  const { data } = await apiClient.get<PaginatedProjectMessages>(
    `/api/admin/custom-projects/${projectId}/messages/${toMessageListQuery(params)}`,
  )
  return data
}

export async function createAdminProjectMessage(
  projectId: string,
  payload: ProjectMessageCreatePayload,
): Promise<ProjectMessage> {
  if (payload.file) {
    const formData = new FormData()
    formData.append('body', payload.body)
    formData.append('file', payload.file)
    const { data } = await apiClient.post<ProjectMessage>(
      `/api/admin/custom-projects/${projectId}/messages/`,
      formData,
    )
    return data
  }
  const { data } = await apiClient.post<ProjectMessage>(
    `/api/admin/custom-projects/${projectId}/messages/`,
    { body: payload.body },
  )
  return data
}

export async function downloadAdminProjectMessageAttachment(
  projectId: string,
  messageId: string,
  attachmentId: string,
  fileName: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    `/api/admin/custom-projects/${projectId}/messages/${messageId}/attachments/${attachmentId}/download/`,
    { responseType: 'blob' },
  )
  const objectUrl = URL.createObjectURL(data)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}

export async function markAdminProjectMessagesRead(
  projectId: string,
): Promise<ProjectMessageReadState> {
  const { data } = await apiClient.post<ProjectMessageReadState>(
    `/api/admin/custom-projects/${projectId}/messages/read/`,
  )
  return data
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

export async function downloadAdminCustomProjectFile(
  projectId: string,
  fileId: string,
  fileName: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    `/api/admin/custom-projects/${projectId}/files/${fileId}/download/`,
    { responseType: 'blob' },
  )
  const objectUrl = URL.createObjectURL(data)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}

function toDeliveryListQuery(params: ProjectDeliveryListParams = {}): string {
  const query = new URLSearchParams()
  if (params.page) query.set('page', String(params.page))
  if (params.page_size) query.set('page_size', String(params.page_size))
  const encoded = query.toString()
  return encoded ? `?${encoded}` : ''
}

export async function listAdminProjectDeliveries(
  projectId: string,
  params: ProjectDeliveryListParams = {},
): Promise<PaginatedProjectDeliveries> {
  const { data } = await apiClient.get<PaginatedProjectDeliveries>(
    `/api/admin/custom-projects/${projectId}/deliveries/${toDeliveryListQuery(params)}`,
  )
  return data
}

export async function uploadAdminProjectDelivery(
  projectId: string,
  payload: ProjectDeliveryUploadPayload,
): Promise<ProjectDelivery> {
  const formData = new FormData()
  formData.append('file', payload.file)
  if (payload.notes != null) {
    formData.append('notes', payload.notes)
  }
  if (payload.version != null) {
    formData.append('version', String(payload.version))
  }
  const { data } = await apiClient.post<ProjectDelivery>(
    `/api/admin/custom-projects/${projectId}/deliveries/`,
    formData,
  )
  return data
}

export async function downloadAdminProjectDelivery(
  projectId: string,
  deliveryId: string,
  fileName: string,
): Promise<void> {
  const { data } = await apiClient.get<Blob>(
    `/api/admin/custom-projects/${projectId}/deliveries/${deliveryId}/download/`,
    { responseType: 'blob' },
  )
  const objectUrl = URL.createObjectURL(data)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}
