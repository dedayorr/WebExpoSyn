import { useCallback, useEffect, useState } from 'react'
import { ApiError, api, type BillingSummary } from '@/lib/api'

/** The signed-in user's plan and website usage, from the API. */
export function useBilling() {
  const [billing, setBilling] = useState<BillingSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<ApiError | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setBilling(await api.billing())
      setError(null)
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Could not load your plan.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { billing, setBilling, loading, error, refresh }
}
