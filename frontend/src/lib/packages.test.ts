import { describe, expect, it } from 'vitest'

import { PACKAGE_LABELS, PACKAGE_ORDER, PRICED_KINDS } from './packages'

describe('packages', () => {
  it('lists the 3ds Max package once, after GLB Only, and the admin prices it', () => {
    expect(PACKAGE_ORDER.filter((kind) => kind === '3ds_max')).toHaveLength(1)
    expect(PACKAGE_ORDER.indexOf('3ds_max')).toBe(PACKAGE_ORDER.indexOf('glb_only') + 1)
    expect(PACKAGE_LABELS['3ds_max']).toBe('3ds Max')
    expect(PRICED_KINDS).toContain('3ds_max')
  })
})
