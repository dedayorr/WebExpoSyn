import cors from 'cors'
import express, { type ErrorRequestHandler } from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { z } from 'zod'
import { config } from './config.js'
import { TargetValidationError, parseDomain } from './lib/target.js'
import { runScan, type ScanOptions } from './services/scan.js'
import { isOwnershipVerified, verificationInstructions } from './services/verification.js'

export interface AppDeps {
  scan?: (url: string, opts: ScanOptions) => ReturnType<typeof runScan>
  verify?: (domain: string) => Promise<boolean>
  maxConcurrentScans?: number
  scanRateLimit?: number
}

const scanBody = z.object({
  url: z.string().trim().min(1, 'Enter a website address.').max(2048),
  dkimSelectors: z
    .array(z.string().regex(/^[a-z0-9._-]{1,63}$/i, 'Selectors may only contain letters, numbers, dots, dashes and underscores.'))
    .max(5)
    .optional(),
})

const domainBody = z.object({ domain: z.string().trim().min(1).max(253) })

export function createApp(deps: AppDeps = {}) {
  const scan = deps.scan ?? runScan
  const verify = deps.verify ?? ((d: string) => isOwnershipVerified(d))
  const maxConcurrent = deps.maxConcurrentScans ?? config.MAX_CONCURRENT_SCANS
  let activeScans = 0

  const app = express()
  app.disable('x-powered-by')
  if (config.TRUST_PROXY) app.set('trust proxy', config.TRUST_PROXY)

  app.use(helmet())
  app.use(cors({ origin: config.corsOrigins, methods: ['GET', 'POST'] }))
  app.use(express.json({ limit: '10kb' }))

  // General limiter for every API route
  app.use(
    '/api',
    rateLimit({ windowMs: 15 * 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }),
  )
  // Stricter limiter for scans, which make outbound requests
  const scanLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: deps.scanRateLimit ?? config.SCAN_RATE_LIMIT_PER_15_MIN,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many scans. Please wait a few minutes and try again.' } },
  })

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', activeScans })
  })

  /** Run an assessment. Synchronous for now: responds with the full report. */
  app.post('/api/scans', scanLimiter, async (req, res) => {
    const body = scanBody.parse(req.body)
    if (activeScans >= maxConcurrent) {
      res.status(503).json({ error: { code: 'BUSY', message: 'The scanner is busy. Please try again in a minute.' } })
      return
    }
    activeScans++
    try {
      const report = await scan(body.url, { dkimSelectors: body.dkimSelectors })
      res.json(report)
    } finally {
      activeScans--
    }
  })

  /** Get the TXT record a user must add to prove they own a domain. */
  app.get('/api/verification/:domain', (req, res) => {
    const domain = parseDomain(req.params.domain)
    res.json(verificationInstructions(domain))
  })

  /** Check whether the TXT record is in place. */
  app.post('/api/verification/check', async (req, res) => {
    const { domain: raw } = domainBody.parse(req.body)
    const domain = parseDomain(raw)
    res.json({ domain, verified: await verify(domain) })
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
