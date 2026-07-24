import { describe, expect, it } from 'vitest'

import {
  PROJECT_MESSAGE_ATTACHMENT_MAX_BYTES,
  validateProjectMessageAttachment,
} from './projectMessageUpload'

describe('validateProjectMessageAttachment', () => {
  it('accepts allowed image types within size limit', () => {
    const file = new File(['png'], 'sketch.png', { type: 'image/png' })
    expect(validateProjectMessageAttachment(file)).toBeNull()
  })

  it('rejects disallowed extensions', () => {
    const file = new File(['MZ'], 'malware.exe', { type: 'application/octet-stream' })
    expect(validateProjectMessageAttachment(file)).toMatch(/invalid file type/i)
  })

  it('rejects empty files', () => {
    const file = new File([], 'empty.png', { type: 'image/png' })
    expect(validateProjectMessageAttachment(file)).toMatch(/empty/i)
  })

  it('rejects oversized files', () => {
    const file = new File(
      [new Uint8Array(PROJECT_MESSAGE_ATTACHMENT_MAX_BYTES + 1)],
      'huge.png',
      { type: 'image/png' },
    )
    expect(validateProjectMessageAttachment(file)).toMatch(/20 MB or smaller/i)
  })
})
