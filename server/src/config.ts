import 'dotenv/config'
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  VERIFICATION_SECRET: z.string().optional(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  MAX_CONCURRENT_SCANS: z.coerce.number().int().positive().default(5),
  SCAN_RATE_LIMIT_PER_15_MIN: z.coerce.number().int().positive().default(10),
  /** Max scans of the same hostname, by anyone, per 10 minutes. */
  TARGET_SCANS_PER_10_MIN: z.coerce.number().int().positive().default(3),
  SCAN_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  /** "required" (default) or "disabled" (local development only). */
  AUTH_MODE: z.enum(['required', 'disabled']).default('required'),
  /** e.g. https://abcd.supabase.co */
  SUPABASE_URL: z.string().url().optional(),
  /** Only for older Supabase projects that still sign tokens with HS256. */
  SUPABASE_JWT_SECRET: z.string().optional(),
  /**
   * Server-only Supabase secret key (sb_secret_... or legacy service_role).
   * Lets the API save scans. Bypasses Row Level Security: never expose it.
   */
  SUPABASE_SECRET_KEY: z.string().optional(),

  // --- Billing (Paystack) ---
  /** Free plan: how many different websites (registrable domains) a user can scan. */
  FREE_SITE_LIMIT: z.coerce.number().int().min(1).default(3),
  /** Server-only Paystack secret key (sk_test_... or sk_live_...). */
  PAYSTACK_SECRET_KEY: z.string().optional(),
  /** Paystack plan code for the Pro monthly plan (PLN_...). */
  PAYSTACK_PLAN_CODE: z.string().optional(),
  /** Pro price in kobo, shown in the app and checked on payment. 500000 = NGN 5,000. */
  PRO_PRICE_KOBO: z.coerce.number().int().positive().default(500_000),
  /** Public URL of the frontend; Paystack returns users to APP_URL/billing. */
  APP_URL: z.string().url().default('http://localhost:5173'),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.flattenError(parsed.error).fieldErrors)
  process.exit(1)
}

const env = parsed.data
const isTest = env.NODE_ENV === 'test'

function fatal(message: string): never {
  console.error(`Configuration error: ${message}`)
  process.exit(1)
}

// Fail closed: never run with a guessable verification secret.
let verificationSecret = env.VERIFICATION_SECRET ?? ''
if (verificationSecret.length < 32) {
  if (isTest) verificationSecret = 'test-only-verification-secret-0123456789'
  else fatal('VERIFICATION_SECRET must be set to a random string of at least 32 characters (see .env.example).')
}

// Fail closed: authentication can only be switched off for local development.
if (env.AUTH_MODE === 'disabled' && env.NODE_ENV !== 'development' && !isTest) {
  fatal('AUTH_MODE=disabled is only allowed when NODE_ENV=development.')
}
if (env.AUTH_MODE === 'required' && !env.SUPABASE_URL && !isTest) {
  fatal('SUPABASE_URL is required when AUTH_MODE=required. For local development without Supabase set NODE_ENV=development and AUTH_MODE=disabled.')
}

if (env.SUPABASE_SECRET_KEY) {
  if (env.SUPABASE_SECRET_KEY.startsWith('sb_publishable_')) {
    fatal('SUPABASE_SECRET_KEY is set to a publishable key. Use the secret key (sb_secret_...) from Project Settings → API Keys.')
  }
  if (!env.SUPABASE_URL) fatal('SUPABASE_SECRET_KEY needs SUPABASE_URL to be set as well.')
} else if (!isTest && env.AUTH_MODE === 'required') {
  console.warn('Warning: SUPABASE_SECRET_KEY is not set, so scan history will not be saved.')
}

if (env.PAYSTACK_SECRET_KEY) {
  if (env.PAYSTACK_SECRET_KEY.startsWith('pk_')) {
    fatal('PAYSTACK_SECRET_KEY is set to a public key. Use the secret key (sk_test_... or sk_live_...) from Paystack Settings → API Keys & Webhooks.')
  }
  if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(env.PAYSTACK_SECRET_KEY)) fatal('PAYSTACK_SECRET_KEY does not look like a Paystack secret key.')
  if (!env.PAYSTACK_PLAN_CODE || !/^PLN_[A-Za-z0-9]+$/.test(env.PAYSTACK_PLAN_CODE)) {
    fatal('PAYSTACK_PLAN_CODE must be set to your Pro plan code (PLN_...) when PAYSTACK_SECRET_KEY is set.')
  }
  if (env.NODE_ENV === 'production' && env.PAYSTACK_SECRET_KEY.startsWith('sk_test_')) {
    console.warn('Warning: using a Paystack TEST key in production. Payments will not be real.')
  }
  if (env.NODE_ENV === 'production' && !env.APP_URL.startsWith('https://')) fatal('APP_URL must use https:// in production.')
} else if (!isTest) {
  console.warn('Warning: PAYSTACK_SECRET_KEY is not set, so upgrading to Pro is unavailable (free limits still apply).')
}

const corsOrigins = env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
if (corsOrigins.includes('*')) fatal('CORS_ORIGINS must list exact origins, not "*".')

export const config = {
  ...env,
  VERIFICATION_SECRET: verificationSecret,
  corsOrigins,
  APP_URL: env.APP_URL.replace(/\/$/, ''),
}

/** Identifies the scanner to site owners in their logs. */
export const USER_AGENT = 'WebExpoSyn-Scanner/0.1 (+https://github.com/dedayorr/WebExpoSyn)'
