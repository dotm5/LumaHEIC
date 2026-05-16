import { describe, expect, it } from 'vitest'
import { isKnownWorkerResponse, serializeWorkerError, workerProgressMessages } from './imageWorkerProtocol'

describe('image worker protocol', () => {
  it('recognizes known response envelopes', () => {
    expect(isKnownWorkerResponse({ type: 'progress', id: 1, message: workerProgressMessages.generatingGainMap })).toBe(true)
    expect(isKnownWorkerResponse({ type: 'processed', id: 1, result: {} })).toBe(true)
    expect(isKnownWorkerResponse({ type: 'encoded', id: 1, result: {}, encoded: {} })).toBe(true)
    expect(isKnownWorkerResponse({ type: 'error', id: 1, message: 'failed' })).toBe(true)
    expect(isKnownWorkerResponse({ type: 'unknown', id: 1 })).toBe(false)
    expect(isKnownWorkerResponse(null)).toBe(false)
  })

  it('serializes thrown worker errors without losing the request id', () => {
    expect(serializeWorkerError(12, new Error('boom'))).toEqual({
      type: 'error',
      id: 12,
      message: 'boom',
    })
  })
})
