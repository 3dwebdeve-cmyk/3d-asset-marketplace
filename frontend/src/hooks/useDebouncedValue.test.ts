import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDebouncedValue } from './useDebouncedValue'

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebouncedValue', () => {
  it('coalesces rapid value changes', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: '' } },
    )

    rerender({ value: 'm' })
    rerender({ value: 'mesh' })
    expect(result.current).toBe('')

    act(() => vi.advanceTimersByTime(300))
    expect(result.current).toBe('mesh')
  })
})
