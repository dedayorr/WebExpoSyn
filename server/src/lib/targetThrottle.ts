/**
 * Limits how often any single hostname can be scanned, across all users.
 *
 * Per-IP rate limits alone don't stop someone with many accounts or IPs from
 * pointing the scanner at a third party's site. This caps the traffic any one
 * target can receive from WebExpoSyn.
 */
export class TargetThrottle {
  private hits = new Map<string, number[]>()

  constructor(
    private limit: number,
    private windowMs: number,
    private now: () => number = Date.now,
  ) {}

  /** Records a scan and returns true if allowed; false if the target is cooling down. */
  tryAcquire(hostname: string): boolean {
    const t = this.now()
    const recent = (this.hits.get(hostname) ?? []).filter((ts) => t - ts < this.windowMs)
    if (recent.length >= this.limit) {
      this.hits.set(hostname, recent)
      return false
    }
    recent.push(t)
    this.hits.set(hostname, recent)
    this.prune(t)
    return true
  }

  /** Seconds until the next scan of this hostname is allowed. */
  retryAfter(hostname: string): number {
    const recent = this.hits.get(hostname) ?? []
    if (!recent.length) return 0
    return Math.max(1, Math.ceil((recent[0] + this.windowMs - this.now()) / 1000))
  }

  private prune(t: number) {
    if (this.hits.size < 10_000) return
    for (const [host, times] of this.hits) {
      if (times.every((ts) => t - ts >= this.windowMs)) this.hits.delete(host)
    }
  }
}
