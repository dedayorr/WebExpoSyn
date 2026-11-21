import { supabase } from '@/lib/supabase'
import type { ScanReport, VerificationInstructions } from '@/types'

const BASE = ((import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:4000').replace(/\/$/, '')

if (!/^https?:\/\//.test(BASE)) {
  throw new Error('VITE_API_URL must start with http:// or https://')
}

/** Scans can take up to a minute on slow sites; leave headroom over the server timeout. */
const REQUEST_TIMEOUT_MS = 90_000

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /** Seconds until retry is allowed (429 responses). */
    public retryAfter?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Always fetch the current session: supabase-js refreshes expired tokens here.
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined

  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
      // Never send cookies to the API; auth is the bearer token only.
      credentials: 'omit',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    if ((err as Error).name === 'TimeoutError') {
      throw new ApiError(0, 'CLIENT_TIMEOUT', 'The scan is taking too long. Please try again later.')
    }
    throw new ApiError(0, 'NETWORK', "Can't reach the WebExpoSyn API. Check your connection, or that the server is running.")
  }

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const retry = Number(res.headers.get('retry-after'))
    throw new ApiError(
      res.status,
      body?.error?.code ?? `HTTP_${res.status}`,
      body?.error?.message ?? 'Something went wrong. Please try again.',
      Number.isFinite(retry) && retry > 0 ? retry : undefined,
    )
  }
  return body as T
}

function assertReport(value: unknown): asserts value is ScanReport {
  const r = value as ScanReport
  if (!r || typeof r.id !== 'string' || !Array.isArray(r.findings) || !r.summary || !r.target) {
    throw new ApiError(0, 'BAD_RESPONSE', 'The server returned an unexpected response.')
  }
}

export const api = {
  async scan(url: string, dkimSelectors?: string[]): Promise<ScanReport> {
    const report = await request<unknown>('/api/scans', {
      method: 'POST',
      body: JSON.stringify({ url, ...(dkimSelectors?.length ? { dkimSelectors } : {}) }),
    })
    assertReport(report)
    return report
  },

  verificationInstructions(domain: string): Promise<VerificationInstructions> {
    return request(`/api/verification/${encodeURIComponent(domain)}`)
  },

  checkVerification(domain: string): Promise<{ domain: string; verified: boolean }> {
    return request('/api/verification/check', { method: 'POST', body: JSON.stringify({ domain }) })
  },
}
