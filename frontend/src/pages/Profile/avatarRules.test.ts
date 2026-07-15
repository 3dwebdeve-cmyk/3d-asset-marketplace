import { describe, expect, it } from 'vitest'

import { validateAvatarFile } from './avatarRules'

function makeFile(name: string, type: string, size: number): File {
  const content = new Uint8Array(Math.max(size, 1))
  return new File([content], name, { type })
}

describe('validateAvatarFile', () => {
  it('accepts a valid png under the size limit', () => {
    expect(validateAvatarFile(makeFile('photo.png', 'image/png', 1024))).toBeNull()
  })

  it('rejects disallowed extensions', () => {
    expect(validateAvatarFile(makeFile('photo.gif', 'image/gif', 1024))).toMatch(
      /extension/i,
    )
  })

  it('rejects files over 2 MB', () => {
    expect(
      validateAvatarFile(makeFile('photo.png', 'image/png', 2 * 1024 * 1024 + 1)),
    ).toMatch(/2 MB/i)
  })
})
