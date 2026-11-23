import { afterEach, describe, expect, it } from 'vitest'

import { StepUpCancelledError, requestStepUp, useStepUpStore } from './stepUpStore'

afterEach(() => {
  useStepUpStore.setState({ isOpen: false, hosts: 0, waiters: [] })
})

describe('requestStepUp', () => {
  it('fails at once when no prompt is on screen to answer it', async () => {
    await expect(requestStepUp()).rejects.toBeInstanceOf(StepUpCancelledError)
    expect(useStepUpStore.getState().isOpen).toBe(false)
  })

  it('opens the prompt and resolves every waiting request when a code is accepted', async () => {
    useStepUpStore.getState().addHost()

    const first = requestStepUp()
    const second = requestStepUp()
    expect(useStepUpStore.getState().isOpen).toBe(true)
    useStepUpStore.getState().complete()

    await expect(first).resolves.toBeUndefined()
    await expect(second).resolves.toBeUndefined()
    expect(useStepUpStore.getState()).toMatchObject({ isOpen: false, waiters: [] })
  })

  it('rejects the waiting requests when the prompt is cancelled', async () => {
    useStepUpStore.getState().addHost()

    const pending = requestStepUp()
    useStepUpStore.getState().cancel()

    await expect(pending).rejects.toBeInstanceOf(StepUpCancelledError)
    expect(useStepUpStore.getState().isOpen).toBe(false)
  })

  it('cancels an open prompt when the last prompt leaves the screen', async () => {
    useStepUpStore.getState().addHost()
    const pending = requestStepUp()

    useStepUpStore.getState().removeHost()

    await expect(pending).rejects.toBeInstanceOf(StepUpCancelledError)
  })
})
