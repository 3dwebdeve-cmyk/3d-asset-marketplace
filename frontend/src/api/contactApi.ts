import { apiClient } from './client'

export interface ContactFormPayload {
  name: string
  email: string
  subject: string
  message: string
  /** Honeypot — leave empty. */
  attachments?: File[]
  website?: string
}

export async function submitContactForm(
  payload: ContactFormPayload,
): Promise<{ detail: string }> {
  let body: ContactFormPayload | FormData = payload
  if (payload.attachments?.length) {
    const form = new FormData()
    for (const key of ['name', 'email', 'subject', 'message', 'website'] as const) {
      if (payload[key] !== undefined) form.append(key, payload[key]!)
    }
    payload.attachments.forEach(file => form.append('attachments', file))
    body = form
  }
  const response = await apiClient.post<{ detail: string }>('/api/v1/contact/', body)
  return response.data
}
