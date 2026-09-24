import { apiClient } from './client'

export interface ContactFormPayload {
  name: string
  email: string
  subject: string
  message: string
  /** Honeypot — leave empty. */
  website?: string
}

export async function submitContactForm(
  payload: ContactFormPayload,
): Promise<{ detail: string }> {
  const response = await apiClient.post<{ detail: string }>('/api/v1/contact/', payload)
  return response.data
}
