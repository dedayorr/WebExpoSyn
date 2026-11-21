import crypto from 'node:crypto'
import { config } from '../config.js'
import { createDnsClient, txtRecords, type DnsClient } from '../lib/dnsClient.js'

/**
 * Domain ownership verification via DNS TXT record.
 *
 * The token is an HMAC of the user id and domain, so it is stable,
 * unguessable and needs no extra storage, and it is bound to one account:
 * user A verifying a domain never unlocks exposure checks for user B.
 */
export function verificationToken(domain: string, userId: string, secret = config.VERIFICATION_SECRET): string {
  const digest = crypto.createHmac('sha256', secret).update(`${userId}:${domain.toLowerCase()}`).digest('hex')
  return `webexposyn-verify=${digest.slice(0, 32)}`
}

export function verificationInstructions(domain: string, userId: string) {
  const record = verificationToken(domain, userId)
  return {
    domain,
    record,
    hosts: [domain, `_webexposyn.${domain}`],
    instructions: `Add a TXT record to ${domain} (or to _webexposyn.${domain}) with the value: ${record}. DNS changes can take a few minutes to appear.`,
  }
}

export async function isOwnershipVerified(
  domain: string,
  userId: string,
  client: DnsClient = createDnsClient(),
  secret?: string,
): Promise<boolean> {
  const token = verificationToken(domain, userId, secret)
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
