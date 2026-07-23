export type CustomProjectStatus =
  | 'submitted'
  | 'under_review'
  | 'quoted'
  | 'approved'
  | 'in_progress'
  | 'delivered'
  | 'completed'
  | 'rejected'
  | 'cancelled'

export const CUSTOM_PROJECT_STATUS_LABELS: Record<CustomProjectStatus, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  quoted: 'Quoted',
  approved: 'Approved',
  in_progress: 'In progress',
  delivered: 'Delivered',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

export type CustomProjectPaymentStatus = 'unpaid' | 'pending' | 'paid' | 'refunded'

export type ProjectQuotationStatus = 'pending' | 'accepted' | 'rejected'

export type ProjectFileType = 'reference_image' | 'cad_drawing' | 'sketch' | 'other'

export type CustomProjectOrdering =
  | 'created_at'
  | '-created_at'
  | 'updated_at'
  | '-updated_at'
  | 'title'
  | '-title'
  | 'deadline'
  | '-deadline'
  | 'status'
  | '-status'

export interface CustomProjectPerson {
  id: string
  email: string
  full_name: string
}

/** Customer-visible designer identity (no email). */
export interface CustomProjectDesignerPublic {
  id: string
  full_name: string
}

export interface CustomerCustomProjectListItem {
  id: string
  title: string
  category: string
  status: CustomProjectStatus
  payment_status: CustomProjectPaymentStatus
  estimated_budget: string | null
  currency: string
  deadline: string | null
  assigned_designer: CustomProjectDesignerPublic | null
  quotation_amount: string | null
  created_at: string
  updated_at: string
}

export interface CustomerCustomProject {
  id: string
  title: string
  description: string
  category: string
  status: CustomProjectStatus
  payment_status: CustomProjectPaymentStatus
  estimated_budget: string | null
  currency: string
  deadline: string | null
  assigned_designer: CustomProjectDesignerPublic | null
  quotation: ProjectQuotation | null
  files: ProjectFile[]
  created_at: string
  updated_at: string
}

export interface CustomerCustomProjectListParams {
  page?: number
  page_size?: number
}

export interface PaginatedCustomerCustomProjects {
  count: number
  next: string | null
  previous: string | null
  results: CustomerCustomProjectListItem[]
}

export interface ProjectQuotation {
  id: string
  amount: string
  currency: string
  estimated_delivery: string | null
  notes: string
  status: ProjectQuotationStatus
  created_at: string
  updated_at: string
}

export interface ProjectFile {
  id: string
  file_type: ProjectFileType
  file_name: string
  download_url?: string
  file_size: number
  uploaded_by_email?: string
  created_at: string
  updated_at: string
}

export interface AdminCustomProjectListItem {
  id: string
  title: string
  category: string
  status: CustomProjectStatus
  payment_status: CustomProjectPaymentStatus
  estimated_budget: string | null
  currency: string
  deadline: string | null
  customer: CustomProjectPerson
  assigned_designer: CustomProjectPerson | null
  quotation_amount: string | null
  created_at: string
  updated_at: string
}

export interface AdminCustomProject extends AdminCustomProjectListItem {
  description: string
  admin_notes: string
  quotation: ProjectQuotation | null
  files: ProjectFile[]
}

export interface AdminCustomProjectCreatePayload {
  customer_id: string
  title: string
  description: string
  category?: string
  estimated_budget?: string | null
  currency?: string
  deadline?: string | null
}

export interface AdminCustomProjectUpdatePayload {
  title?: string
  description?: string
  category?: string
  estimated_budget?: string | null
  currency?: string
  deadline?: string | null
  status?: CustomProjectStatus
  assigned_designer_id?: string | null
  payment_status?: CustomProjectPaymentStatus
  admin_notes?: string
}

export interface ProjectQuotationUpsertPayload {
  amount: string
  currency?: string
  estimated_delivery?: string | null
  notes?: string
  status?: ProjectQuotationStatus
}

export interface AdminCustomProjectListParams {
  search?: string
  status?: CustomProjectStatus
  payment_status?: CustomProjectPaymentStatus
  customer_id?: string
  ordering?: CustomProjectOrdering
  page?: number
  page_size?: number
}

export interface PaginatedCustomProjects {
  count: number
  next: string | null
  previous: string | null
  results: AdminCustomProjectListItem[]
}

export interface ProjectQuotationUpsertResponse {
  quotation: ProjectQuotation
  project: AdminCustomProject
}

export interface ProjectMessageSender {
  id: string
  full_name: string
}

export interface ProjectMessage {
  id: string
  project_id: string
  body: string
  sender: ProjectMessageSender
  created_at: string
  updated_at: string
}

export interface ProjectMessageCreatePayload {
  body: string
}

export interface ProjectMessageListParams {
  page?: number
  page_size?: number
}

export interface PaginatedProjectMessages {
  count: number
  next: string | null
  previous: string | null
  results: ProjectMessage[]
}
