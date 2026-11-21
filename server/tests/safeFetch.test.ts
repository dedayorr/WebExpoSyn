import { describe, expect, it } from 'vitest'
import { safeFetch } from '../src/lib/safeFetch.js'
import { TargetValidationError } from '../src/lib/target.js'

describe('safeFetch', () => {
  it('refuses to connect when the host resolves to a private address', async () => {
    const lookupAll = async () => [{ address: '10.0.0.7', family: 4 }]
    await expect(safeFetch('https://looks-public.example.com/', { lookupAll })).rejects.toMatchObject({
      code: 'PRIVATE_ADDRESS',
    })
  })

  it('refuses cloud metadata addresses', async () => {
    const lookupAll = async () => [{ address: '169.254.169.254', family: 4 }]
    await expect(safeFetch('http://metadata.example.com/latest/meta-data/', { lookupAll })).rejects.toBeInstanceOf(
      TargetValidationError,
    )
  })

  it('refuses non-web ports before resolving', async () => {
    let resolved = false
    const lookupAll = async () => {
      resolved = true
      return [{ address: '93.184.216.34', family: 4 }]
    }
    await expect(safeFetch('http://example.com:6379/', { lookupAll })).rejects.toMatchObject({ code: 'PORT_NOT_ALLOWED' })
    expect(resolved).toBe(false)
  })
})
