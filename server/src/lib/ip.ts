import ipaddr from 'ipaddr.js'

/**
 * True only for globally routable unicast addresses.
 *
 * Blocks loopback, private (RFC 1918), link-local (incl. cloud metadata
 * 169.254.169.254), carrier-grade NAT, multicast, broadcast, unspecified,
 * documentation/benchmark ranges, IPv6 unique-local, and IPv4-mapped IPv6
 * forms of any of those. Unknown or unparseable input is treated as unsafe.
 */
export function isPublicIp(ip: string): boolean {
  if (!ipaddr.isValid(ip)) return false
  let addr = ipaddr.parse(ip)

  if (addr.kind() === 'ipv6') {
    const v6 = addr as ipaddr.IPv6
    if (v6.isIPv4MappedAddress()) addr = v6.toIPv4Address()
  }

  // ipaddr.js labels ordinary internet addresses "unicast"; everything else
  // (private, loopback, linkLocal, carrierGradeNat, reserved, uniqueLocal,
  // 6to4, teredo, rfc6052 ...) is rejected.
  return addr.range() === 'unicast'
}

export function isIpLiteral(host: string): boolean {
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  return ipaddr.isValid(bare)
}
