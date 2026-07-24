import { describe, expect, it } from 'vitest'

import {
  PROJECT_DELIVERY_MAX_BYTES,
  validateProjectDeliveryFile,
} from './projectDeliveryUpload'

describe('validateProjectDeliveryFile', () => {
  it('accepts allowed archive types within size limit', () => {
    const file = new File(['zip'], 'final.zip', { type: 'application/zip' })
    expect(validateProjectDeliveryFile(file)).toBeNull()
  })

  it('rejects disallowed extensions', () => {
    const file = new File(['MZ'], 'malware.exe', { type: 'application/octet-stream' })
    expect(validateProjectDeliveryFile(file)).toMatch(/invalid file type/i)
  })

  it('rejects empty files', () => {
    const file = new File([], 'empty.zip', { type: 'application/zip' })
    expect(validateProjectDeliveryFile(file)).toMatch(/empty/i)
  })

  it('rejects oversized files', () => {
    const file = new File(
      [new Uint8Array(PROJECT_DELIVERY_MAX_BYTES + 1)],
      'huge.zip',
      { type: 'application/zip' },
    )
    expect(validateProjectDeliveryFile(file)).toMatch(/20 MB or smaller/i)
  })
})
