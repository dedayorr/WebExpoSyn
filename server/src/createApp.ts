import cors from 'cors'
import express, { type ErrorRequestHandler, type Request } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import helmet from 'helmet'
import { z } from 'zod'
import { config } from './config.js'
import { logEvent } from './lib/logger.js'
import { TargetValidationError, parseDomain, parseTarget } from './lib/target.js'
import { explainMissingDomain, lookupDomainStatus, type DomainStatus } from './lib/domainStatus.js'
import { TargetThrottle } from './lib/targetThrottle.js'
import { defaultVerifier, requireAuth, type TokenVerifier } from './middleware/auth.js'
import { billingRouter, billingWebhook, type BillingDeps } from './routes/billing.js'
import { defaultBillingStore, defaultPaystack, isPro, type BillingStore, type PaystackApi } from './services/billing.js'
import { runScan, type ScanOptions } from './services/scan.js'
import { defaultStore, isUuid, type ScanStore } from './services/store.js'
import { isOwnershipVerified, verificationInstructions } from './services/verification.js'

export interface AppDeps {
  scan?: (url: string, opts: ScanOptions) => ReturnType<typeof runScan>
  /** Checks the DNS TXT record for this user's token. */
  verify?: (domain: string, userId: string) => Promise<boolean>
  /** Explains why a domain has no DNS records (expired, unregistered...). */
  domainStatus?: (domain: string) => Promise<DomainStatus>
  /** null disables saving (no secret key configured). */
  store?: ScanStore | null
  /** null disables auth (development only). */
  verifier?: TokenVerifier | null
  /** Plans and usage. null disables plan limits (no secret key configured). */
  billing?: BillingStore | null
  /** null disables upgrading (no Paystack key configured). */
  paystack?: PaystackApi | null
  paystackSecretKey?: string
  paystackPlanCode?: string
  freeSiteLimit?: number
  maxConcurrentScans?: number
  scanRateLimit?: number
  targetScansPerWindow?: number
  scanTimeoutMs?: number
}

const scanBody = z.object({
  url: z.string().trim().min(1, 'Enter a website address.').max(2048),
  dkimSelectors: z
    .array(z.string().regex(/^[a-z0-9._-]{1,63}$/i, 'Selectors may only contain letters, numbers, dots, dashes and underscores.'))
    .max(5)
    .optional(),
})

const domainBody = z.object({ domain: z.string().trim().min(1).max(253) })

class ScanTimeoutError extends Error {}

/** Rate-limit by signed-in user when available, otherwise by IP (IPv6 /56 subnet). */
const userOrIpKey = (req: Request) => (req.user ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip ?? '')}`)

export function createApp(deps: AppDeps = {}) {
  const scan = deps.scan ?? runScan
  const verify = deps.verify ?? ((d: string, userId: string) => isOwnershipVerified(d, userId))
  const store = deps.store !== undefined ? deps.store : defaultStore()
  const verifier = deps.verifier !== undefined ? deps.verifier : defaultVerifier()
  const maxConcurrent = deps.maxConcurrentScans ?? config.MAX_CONCURRENT_SCANS
  const scanTimeoutMs = deps.scanTimeoutMs ?? config.SCAN_TIMEOUT_MS
  const throttle = new TargetThrottle(deps.targetScansPerWindow ?? config.TARGET_SCANS_PER_10_MIN, 10 * 60_000)
  const auth = requireAuth(verifier)
  const billing = deps.billing !== undefined ? deps.billing : defaultBillingStore()
  const paystack = deps.paystack !== undefined ? deps.paystack : defaultPaystack()
  const siteLimit = deps.freeSiteLimit ?? config.FREE_SITE_LIMIT
  let activeScans = 0
  /** New websites each user is scanning right now, so parallel requests can't slip past the limit. */
  const pendingDomains = new Map<string, Set<string>>()

  const app = express()
  app.disable('x-powered-by')
  if (config.TRUST_PROXY) app.set('trust proxy', config.TRUST_PROXY)

  app.use(helmet())
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      maxAge: 600,
    }),
  )
  const billingLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req: Request) => (req.user ? `user:${req.user.id}` : `ip:${ipKeyGenerator(req.ip ?? '')}`),
  })
  const billingDeps: BillingDeps = {
    auth,
    limiter: billingLimiter,
    store: billing,
    paystack,
    secretKey: deps.paystackSecretKey ?? config.PAYSTACK_SECRET_KEY,
    planCode: deps.paystackPlanCode ?? config.PAYSTACK_PLAN_CODE,
    siteLimit,
    priceKobo: config.PRO_PRICE_KOBO,
  }

  // Paystack webhook needs the raw body for its signature, so it goes before express.json().
  app.post(
    '/api/billing/webhook',
    rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }),
    ...billingWebhook(billingDeps),
  )

  app.use(express.json({ limit: '10kb' }))

  // General limiter for every API route
  app.use('/api', rateLimit({ windowMs: 15 * 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }))

  // Stricter limiter for scans, which make outbound requests
  const scanLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: deps.scanRateLimit ?? config.SCAN_RATE_LIMIT_PER_15_MIN,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: userOrIpKey,
    handler: (req, res) => {
      logEvent('scan.rate_limited', { ip: req.ip, user: req.user?.id })
      res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many scans. Please wait a few minutes and try again.' } })
    },
  })
  const verificationLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: userOrIpKey,
  })

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  /** Run an assessment. Synchronous for now: responds with the full report. */
  app.post('/api/scans', auth, scanLimiter, async (req, res) => {
    const body = scanBody.parse(req.body)
    const who = { ip: req.ip, user: req.user?.id }

    // Cheap syntactic validation first, so rejected targets never use a slot.
    let hostname: string
    let domain: string
    try {
      ;({ hostname, domain } = parseTarget(body.url))
    } catch (err) {
      if (err instanceof TargetValidationError) logEvent('scan.rejected_target', { ...who, input: body.url, code: err.code })
      throw err
    }

    // Free plan: up to `siteLimit` different websites. Rescans of a site already in
    // the user's history are always allowed. Fails closed if the plan can't be read.
    const userId = req.user!.id
    let pendingSet: Set<string> | undefined
    if (billing && isUuid(userId)) {
      let pro: boolean
      let known: string[]
      try {
        const [sub, domains] = await Promise.all([billing.getSubscription(userId), billing.listScannedDomains(userId)])
        pro = isPro(sub)
        known = domains
      } catch (err) {
        logEvent('billing.usage_failed', { ...who, reason: err instanceof Error ? err.message : 'unknown' })
        res.status(503).json({ error: { code: 'PLAN_CHECK_FAILED', message: 'We could not check your plan. Please try again in a minute.' } })
        return
      }
      const pending = pendingDomains.get(userId) ?? new Set<string>()
      const inUse = new Set([...known, ...pending])
      if (!pro && !inUse.has(domain) && inUse.size >= siteLimit) {
        logEvent('scan.plan_limit', { ...who, target: hostname, sitesUsed: inUse.size })
        res.status(402).json({
          error: {
            code: 'PLAN_LIMIT',
            message: `The free plan covers ${siteLimit} websites. Upgrade to Pro to scan more, or delete an old website's reports to free a slot.`,
          },
        })
        return
      }
      if (!known.includes(domain)) pendingSet = pending
    }

    if (activeScans >= maxConcurrent) {
      logEvent('scan.busy', who)
      res.status(503).json({ error: { code: 'BUSY', message: 'The scanner is busy. Please try again in a minute.' } })
      return
    }
    if (!throttle.tryAcquire(hostname)) {
      logEvent('scan.target_cooldown', { ...who, target: hostname })
      res.setHeader('Retry-After', String(throttle.retryAfter(hostname)))
      res.status(429).json({
        error: { code: 'TARGET_COOLDOWN', message: `${hostname} was scanned recently. Please wait a few minutes before scanning it again.` },
      })
      return
    }

    // The slot is held until the scan really finishes, even if we stop waiting.
    activeScans++
    if (pendingSet) {
      pendingSet.add(domain)
      pendingDomains.set(userId, pendingSet)
    }
    const started = Date.now()
    const work = scan(body.url, {
      dkimSelectors: body.dkimSelectors,
      verifyOwnership: (domain) => verify(domain, userId),
    })
    work
      .finally(() => {
        activeScans--
        if (pendingSet) {
          pendingSet.delete(domain)
          if (pendingSet.size === 0) pendingDomains.delete(userId)
        }
      })
      .catch(() => {})

    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ScanTimeoutError()), scanTimeoutMs)
    })
    try {
      const report = await Promise.race([work, timeout])
      logEvent('scan.completed', {
        ...who,
        target: hostname,
        durationMs: Date.now() - started,
        fail: report.summary.fail,
        ownershipVerified: report.ownershipVerified,
      })
      // Save to the user's history. A storage failure must not lose the
      // result: the client keeps unsaved reports locally instead.
      let persisted = false
      if (store && isUuid(userId)) {
        try {
          await store.saveScan(userId, report)
          persisted = true
        } catch (err) {
          logEvent('scan.persist_failed', { ...who, target: hostname, reason: err instanceof Error ? err.message : 'unknown' })
        }
      }
      res.json({ ...report, persisted })
    } catch (err) {
      if (err instanceof ScanTimeoutError) {
        logEvent('scan.timeout', { ...who, target: hostname })
        res.status(504).json({ error: { code: 'SCAN_TIMEOUT', message: 'The scan took too long. Please try again later.' } })
        return
      }
      if (err instanceof TargetValidationError) {
        if (err.code === 'DOMAIN_NOT_FOUND') {
          // Tell the user *why*: expired, never registered, suspended, or no website.
          const status = await (deps.domainStatus ?? lookupDomainStatus)(domain).catch((): DomainStatus => ({ state: 'unknown' }))
          const { code, message, advice } = explainMissingDomain(hostname, domain, status)
          logEvent('scan.rejected_target', { ...who, target: hostname, code, domainState: status.state })
          throw new TargetValidationError(code as TargetValidationError['code'], message, advice)
        }
        logEvent('scan.rejected_target', { ...who, target: hostname, code: err.code })
      } else {
        logEvent('scan.failed', { ...who, target: hostname })
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  })

  /** Get the TXT record a user must add to prove they own a domain. */
  app.get('/api/verification/:domain', auth, verificationLimiter, (req, res) => {
    const domain = parseDomain(String(req.params.domain))
    res.json(verificationInstructions(domain, req.user!.id))
  })

  /** Check whether the TXT record is in place. */
  app.post('/api/verification/check', auth, verificationLimiter, async (req, res) => {
    const { domain: raw } = domainBody.parse(req.body)
    const domain = parseDomain(raw)
    const userId = req.user!.id
    const verified = await verify(domain, userId)
    if (verified && store && isUuid(userId)) {
      await store.markVerified(userId, domain).catch((err: unknown) =>
        logEvent('verification.persist_failed', { user: userId, domain, reason: err instanceof Error ? err.message : 'unknown' }),
      )
    }
    logEvent('verification.checked', { ip: req.ip, user: userId, domain, verified })
    res.json({ domain, verified })
  })

  app.use('/api/billing', billingRouter(billingDeps))

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API route.' } })
  })

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: err.issues[0]?.message ?? 'Invalid request.' } })
      return
    }
    if (err instanceof TargetValidationError) {
      res.status(422).json({ error: { code: err.code, message: err.message, ...(err.advice ? { advice: err.advice } : {}) } })
      return
    }
    if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: 'Invalid request body.' } })
      return
    }
    console.error(err)
    // Never leak stack traces or internal details to clients.
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong running the scan.' } })
  }
  app.use(errorHandler)

  return app
}
