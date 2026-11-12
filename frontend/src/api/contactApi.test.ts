import { describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { submitContactForm } from './contactApi'
vi.mock('./client', () => ({ apiClient: { post: vi.fn().mockResolvedValue({ data: { detail: 'Received' } }) } }))
describe('contact file uploads', () => {
  it('sends actual files in multipart form data', async () => {
    const image = new File(['image content'], 'chair.png', { type: 'image/png' })
    await submitContactForm({ name: 'Alex Creator', email: 'alex@example.com', subject: 'Chair renders', message: 'Please render a chair', attachments: [image] })
    const body = vi.mocked(apiClient.post).mock.lastCall![1] as FormData
    expect(body).toBeInstanceOf(FormData)
    expect(body.get('name')).toBe('Alex Creator')
    expect(body.getAll('attachments')).toEqual([image])
  })
})
