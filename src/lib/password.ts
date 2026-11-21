export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 128

// A handful of the most common passwords and patterns. Supabase's
// "leaked password protection" (HaveIBeenPwned) should also be enabled
// in the dashboard for full coverage.
const COMMON = [
  'password',
  '123456',
  'qwerty',
  'letmein',
  'welcome',
  'admin',
  'iloveyou',
  'monkey',
  'dragon',
  'football',
  'abc123',
  'webexposyn',
]

export interface PasswordCheck {
  ok: boolean
  /** 0–4 */
  score: number
  label: 'Too short' | 'Weak' | 'Fair' | 'Good' | 'Strong'
  problems: string[]
}

export function checkPassword(password: string, email = ''): PasswordCheck {
  const problems: string[] = []
  const lower = password.toLowerCase()
  const local = email.split('@')[0]?.toLowerCase() ?? ''

  if (password.length < PASSWORD_MIN) problems.push(`Use at least ${PASSWORD_MIN} characters.`)
  if (password.length > PASSWORD_MAX) problems.push(`Use at most ${PASSWORD_MAX} characters.`)
  if (COMMON.some((c) => lower.includes(c))) problems.push('Avoid common words like "password" or "123456".')
  if (local.length >= 3 && lower.includes(local)) problems.push("Don't include your email name in your password.")
  if (/^(.)\1+$/.test(password)) problems.push("Don't repeat a single character.")

  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length
  let score = 0
  if (password.length >= PASSWORD_MIN) score++
  if (password.length >= 14) score++
  if (variety >= 3) score++
  if (password.length >= 18 || variety === 4) score++
  if (problems.length) score = Math.min(score, 1)

  const label = password.length < PASSWORD_MIN ? 'Too short' : (['Weak', 'Weak', 'Fair', 'Good', 'Strong'] as const)[score]
  return { ok: problems.length === 0 && score >= 2, score, label, problems }
}
