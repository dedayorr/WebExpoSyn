import cors from 'cors'
import express, { type ErrorRequestHandler, type Request } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import helmet from 'helmet'
import { z } from 'zod'
import { config } from './config.js'
import { logEvent } from './lib/logger.js'
import { TargetValidationError, parseDomain, parseTarget } from './lib/target.js'
import { TargetThrottle } from './lib/targetThrottle.js'
import { defaultVerifier, requireAuth, type TokenVerifier } from './middleware/auth.js'
import { runScan, type ScanOptions } from './services/scan.js'
import { isOwnershipVerified, verificationInstructions } from './services/verification.js'

export interface AppDeps {
  scan?: (url: string, opts: ScanOptions) => ReturnType<typeof runScan>
  verify?: (domain: string) => Promise<boolean>
  /** null disables auth (development only). */
  verifier?: TokenVerifier | null
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
  const verify = deps.verify ?? ((d: string) => isOwnershipVerified(d))
  const verifier = deps.verifier !== undefined ? deps.verifier : defaultVerifier()
  const maxConcurrent = deps.maxConcurrentScans ?? config.MAX_CONCURRENT_SCANS
  const scanTimeoutMs = deps.scanTimeoutMs ?? config.SCAN_TIMEOUT_MS
  const throttle = new TargetThrottle(deps.targetScansPerWindow ?? config.TARGET_SCANS_PER_10_MIN, 10 * 60_000)
  const auth = requireAuth(verifier)
  let activeScans = 0

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
    try {
      hostname = parseTarget(body.url).hostname
    } catch (err) {
      if (err instanceof TargetValidationError) logEvent('scan.rejected_target', { ...who, input: body.url, code: err.code })
      throw err
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
    const started = Date.now()
    const work = scan(body.url, { dkimSelectors: body.dkimSelectors })
    work.finally(() => activeScans--).catch(() => {})

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
      res.json(report)
    } catch (err) {
      if (err instanceof ScanTimeoutError) {
        logEvent('scan.timeout', { ...who, target: hostname })
        res.status(504).json({ error: { code: 'SCAN_TIMEOUT', message: 'The scan took too long. Please try again later.' } })
        return
      }
      if (err instanceof TargetValidationError) {
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
    res.json(verificationInstructions(domain))
  })

  /** Check whether the TXT record is in place. */
  app.post('/api/verification/check', auth, verificationLimiter, async (req, res) => {
    const { domain: raw } = domainBody.parse(req.body)
    const domain = parseDomain(raw)
    const verified = await verify(domain)
    logEvent('verification.checked', { ip: req.ip, user: req.user?.id, domain, verified })
    res.json({ domain, verified })
  })

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API route.' } })
  })

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: 'INVALID_REQUEST', message: err.issues[0]?.message ?? 'Invalid request.' } })
      return
    }
    if (err instanceof TargetValidationError) {
      res.status(422).json({ error: { code: err.code, message: err.message } })
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
