import { describe, expect, it } from 'vitest'
import { isTransient, withRetry } from '../src/lib/retry.js'
import { TargetValidationError } from '../src/lib/target.js'

describe('withRetry', () => {
  it('retries once after a transient failure', async () => {
    let calls = 0
    const result = await withRetry(
      async () => {
        calls++
        if (calls === 1) throw Object.assign(new Error('reset'), { code: 'ECONNRESET' })
        return 'ok'
      },
      { delayMs: 1 },
    )
    expect(result).toBe('ok')
    expect(calls).toBe(2)
  })

  it('does not retry permanent failures such as a blocked target', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw new TargetValidationError('PRIVATE_ADDRESS', 'blocked')
        },
        { delayMs: 1 },
      ),
    ).rejects.toThrow('blocked')
    expect(calls).toBe(1)
  })

  it('gives up after the retry budget', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw Object.assign(new Error('t'), { code: 'ETIMEDOUT' })
        },
        { delayMs: 1 },
      ),
    ).rejects.toThrow()
    expect(calls).toBe(2)
  })

  it('classifies errors', () => {
    expect(isTransient(new DOMException('x', 'TimeoutError'))).toBe(true)
    expect(isTransient(new Error('socket hang up'))).toBe(true)
    expect(isTransient(Object.assign(new Error('x'), { code: 'ENOTFOUND' }))).toBe(false)
  })
})
