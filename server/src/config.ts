import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  VERIFICATION_SECRET: z.string().min(16).default('dev-only-verification-secret-change-me'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  MAX_CONCURRENT_SCANS: z.coerce.number().int().positive().default(5),
  SCAN_RATE_LIMIT_PER_15_MIN: z.coerce.number().int().positive().default(10),
  SCAN_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const config = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
}

if (config.NODE_ENV === 'production' && config.VERIFICATION_SECRET.startsWith('dev-only')) {
  console.error('VERIFICATION_SECRET must be set in production.')
  process.exit(1)
}

/** Identifies the scanner to site owners in their logs. */
export const USER_AGENT = 'WebExpoSyn-Scanner/0.1 (+https://github.com/dedayorr/WebExpoSyn)'
