import type { DnsClient } from '../src/lib/dnsClient.js'

type Zone = {
  txt?: Record<string, string[]>
  mx?: Record<string, { exchange: string; priority: number }[]>
  a?: Record<string, string[]>
  ns?: Record<string, string[]>
  cname?: Record<string, string[]>
}

const nodata = () => Promise.reject(Object.assign(new Error('ENODATA'), { code: 'ENODATA' }))

/** In-memory DNS for tests. Missing names behave like NODATA. */
export function fakeDns(zone: Zone): DnsClient {
  const pick = <T>(map: Record<string, T[]> | undefined, name: string) => (map?.[name] ? Promise.resolve(map[name]) : nodata())
  return {
    resolve4: (n) => pick(zone.a, n),
    resolve6: () => nodata(),
    resolveNs: (n) => pick(zone.ns, n),
    resolveMx: (n) => pick(zone.mx, n),
    resolveTxt: (n) => (zone.txt?.[n] ? Promise.resolve(zone.txt[n].map((t) => [t])) : nodata()),
    resolveCaa: () => nodata(),
    resolveCname: (n) => pick(zone.cname, n),
    resolveSoa: () => nodata(),
  } as DnsClient
}
