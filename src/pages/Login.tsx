import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FormAlert, PasswordField, SubmitButton, TextField } from '@/components/auth/fields'
import { useAuth } from '@/auth/AuthProvider'
import { safeNext } from '@/lib/safeRedirect'
import { supabase } from '@/lib/supabase'

/** Client-side cool-down after repeated failures (Supabase also rate-limits server-side). */
const MAX_ATTEMPTS = 5
const COOLDOWN_MS = 30_000

export default function Login() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const next = safeNext(params.get('next'))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lockedUntil, setLockedUntil] = useState(0)
  const failures = useRef(0)

  useEffect(() => {
    if (session) navigate(next, { replace: true })
  }, [session, next, navigate])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!supabase) return
    if (Date.now() < lockedUntil) {
      setError('Too many attempts. Please wait a moment and try again.')
      return
    }
    setLoading(true)
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (err) {
      failures.current += 1
      if (failures.current >= MAX_ATTEMPTS) {
        failures.current = 0
        setLockedUntil(Date.now() + COOLDOWN_MS)
      }
      // One message for wrong email OR wrong password: doesn't reveal which accounts exist.
      if (/not confirmed/i.test(err.message)) {
        setError('Please confirm your email address first. Check your inbox for the link we sent.')
      } else if (err.status === 429) {
        setError('Too many attempts. Please wait a few minutes and try again.')
      } else {
        setError('Incorrect email or password.')
      }
      setPassword('')
      return
    }
    failures.current = 0
    navigate(next, { replace: true })
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to view your assessments and run new scans."
      footer={
        <>
          New to WebExpoSyn?{' '}
          <Link to={`/signup${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-periwinkle hover:text-white">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {params.get('confirmed') && !error && <FormAlert tone="success">Email confirmed. You can sign in now.</FormAlert>}
        {params.get('reset') && !error && <FormAlert tone="success">Password updated. Sign in with your new password.</FormAlert>}
        {error && <FormAlert tone="error">{error}</FormAlert>}
        <TextField
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
        <PasswordField
          label="Password"
          name="password"
          autoComplete="current-password"
          required
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint={
            <Link to="/forgot-password" className="text-xs font-medium text-periwinkle hover:text-white">
              Forgot password?
            </Link>
          }
        />
        <SubmitButton loading={loading} disabled={!supabase || !email || !password}>
          Sign in
        </SubmitButton>
      </form>
    </AuthLayout>
  )
}
