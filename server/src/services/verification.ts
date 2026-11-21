import crypto from 'node:crypto'
import { config } from '../config.js'
import { createDnsClient, txtRecords, type DnsClient } from '../lib/dnsClient.js'

/**
 * Domain ownership verification via DNS TXT record.
 *
 * The token is an HMAC of the domain, so it is stable, unguessable and needs
 * no database: the same domain always gets the same token for a given secret.
 * When Supabase is added, tokens can be bound to user accounts instead.
 */
export function verificationToken(domain: string, secret = config.VERIFICATION_SECRET): string {
  const digest = crypto.createHmac('sha256', secret).update(domain.toLowerCase()).digest('hex')
  return `webexposyn-verify=${digest.slice(0, 32)}`
}

export function verificationInstructions(domain: string) {
  const record = verificationToken(domain)
  return {
    domain,
    record,
    hosts: [domain, `_webexposyn.${domain}`],
    instructions: `Add a TXT record to ${domain} (or to _webexposyn.${domain}) with the value: ${record}. DNS changes can take a few minutes to appear.`,
  }
}

export async function isOwnershipVerified(
  domain: string,
  client: DnsClient = createDnsClient(),
  secret?: string,
): Promise<boolean> {
  const token = verificationToken(domain, secret)
  for (const host of [domain, `_webexposyn.${domain}`]) {
    try {
      const records = await txtRecords(client, host)
      if (records.some((r) => r.trim() === token)) return true
    } catch {
      // treat lookup failures as "not verified"
    }
  }
  return false
}
