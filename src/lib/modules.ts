import type { ModuleId } from '@/types'

export const MODULE_LABELS: Record<ModuleId, string> = {
  tls: 'SSL/TLS',
  headers: 'HTTP headers',
  dns: 'DNS security',
  email: 'Email security',
  exposure: 'Website exposure',
}

export const MODULE_SHORT: Record<ModuleId, string> = {
  tls: 'SSL/TLS',
  headers: 'Headers',
  dns: 'DNS',
  email: 'Email',
  exposure: 'Exposure',
}

export const MODULE_ORDER: ModuleId[] = ['tls', 'headers', 'dns', 'email', 'exposure']

export function formatDate(iso: string, withTime = true) {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}
