import dns from 'node:dns'

/** Subset of node:dns Resolver we use, so tests can supply a fake. */
export interface DnsClient {
  resolve4(name: string): Promise<string[]>
  resolve6(name: string): Promise<string[]>
  resolveNs(name: string): Promise<string[]>
  resolveMx(name: string): Promise<{ exchange: string; priority: number }[]>
  resolveTxt(name: string): Promise<string[][]>
  resolveCaa(name: string): Promise<dns.CaaRecord[]>
  resolveCname(name: string): Promise<string[]>
  resolveSoa(name: string): Promise<dns.SoaRecord>
}

export function createDnsClient(servers?: string[], timeoutMs = 3_000, tries = 2): DnsClient {
  const resolver = new dns.promises.Resolver({ timeout: timeoutMs, tries })
  if (servers?.length) resolver.setServers(servers)
  return resolver
}

/** Joins TXT record chunks and returns one string per record. */
export async function txtRecords(client: DnsClient, name: string): Promise<string[]> {
  try {
    const records = await client.resolveTxt(name)
    return records.map((chunks) => chunks.join(''))
  } catch (err) {
    if (isNoData(err)) return []
    throw err
  }
}

/** NODATA / NXDOMAIN mean "no such record", not a failure. */
export function isNoData(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code
  return code === 'ENODATA' || code === 'ENOTFOUND' || code === 'NXDOMAIN'
}

export async function orEmpty<T>(p: Promise<T[]>): Promise<T[]> {
  try {
    return await p
  } catch (err) {
    if (isNoData(err)) return []
    throw err
  }
}
