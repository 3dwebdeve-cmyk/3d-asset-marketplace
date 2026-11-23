import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useStepUpStore } from '../store/stepUpStore'
import { apiClient } from './client'

const originalAdapter = apiClient.defaults.adapter

function reply(config: InternalAxiosRequestConfig, status: number, data: unknown) {
  const response = { data, status, statusText: '', headers: {}, config }
  if (status >= 400) {
    return Promise.reject(
      new AxiosError('Request failed', String(status), config, undefined, response),
    )
  }
  return Promise.resolve(response)
}

const stepUpRequired = { detail: 'Enter a code from your authenticator app to continue.', code: 'step_up_required' }

/** Answer the queued replies in order and record every request the client sent. */
function serverReplies(...replies: Array<[number, unknown]>) {
  const sent: InternalAxiosRequestConfig[] = []
  const adapter: AxiosAdapter = (config) => {
    sent.push(config)
    const [status, data] = replies[Math.min(sent.length - 1, replies.length - 1)]!
    return reply(config, status, data)
  }
  apiClient.defaults.adapter = adapter
  return sent
}

/** Stand in for the console's prompt: answer the next request the way `answer` says. */
function promptOnScreen(answer: 'confirm' | 'cancel') {
  useStepUpStore.getState().addHost()
  return useStepUpStore.subscribe((state) => {
    if (state.isOpen) {
      if (answer === 'confirm') {
        state.complete()
      } else {
        state.cancel()
      }
    }
  })
}

beforeEach(() => {
  useStepUpStore.setState({ isOpen: false, hosts: 0, waiters: [] })
})

afterEach(() => {
  apiClient.defaults.adapter = originalAdapter
  useStepUpStore.setState({ isOpen: false, hosts: 0, waiters: [] })
})

describe('apiClient step-up', () => {
  it('repeats the refused request once the administrator enters a code', async () => {
    const sent = serverReplies([403, stepUpRequired], [200, { deleted: 'model-1' }])
    const stop = promptOnScreen('confirm')

    const response = await apiClient.post('/api/v1/admin/products/model-1/purge/', {})

    stop()
    expect(response.data).toEqual({ deleted: 'model-1' })
    expect(sent).toHaveLength(2)
    expect(sent[1]!.url).toBe('/api/v1/admin/products/model-1/purge/')
  })

  it('gives the caller the server message when the prompt is cancelled', async () => {
    const sent = serverReplies([403, stepUpRequired])
    const stop = promptOnScreen('cancel')

    const request = apiClient.post('/api/v1/admin/products/model-1/purge/', {})

    await expect(request).rejects.toMatchObject({ response: { status: 403, data: stepUpRequired } })
    stop()
    expect(sent).toHaveLength(1)
  })

  it('asks only once per request, even if the server refuses again', async () => {
    const sent = serverReplies([403, stepUpRequired], [403, stepUpRequired])
    const stop = promptOnScreen('confirm')

    await expect(apiClient.post('/api/v1/admin/pricing/publish/', {})).rejects.toMatchObject({
      response: { status: 403 },
    })

    stop()
    expect(sent).toHaveLength(2)
  })

  it('leaves other 403 answers alone', async () => {
    const sent = serverReplies([403, { detail: 'Administrator access required.', code: 'permission_denied' }])
    const opened = vi.fn()
    useStepUpStore.getState().addHost()
    const stop = useStepUpStore.subscribe((state) => state.isOpen && opened())

    await expect(apiClient.get('/api/v1/admin/products/')).rejects.toMatchObject({
      response: { status: 403 },
    })

    stop()
    expect(opened).not.toHaveBeenCalled()
    expect(sent).toHaveLength(1)
  })
})
