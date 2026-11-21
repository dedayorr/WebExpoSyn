import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FormAlert, PasswordField, PasswordStrength, SubmitButton, TextField } from '@/components/auth/fields'
import { useAuth } from '@/auth/AuthProvider'
import { checkPassword } from '@/lib/password'
import { safeNext } from '@/lib/safeRedirect'
import { supabase } from '@/lib/supabase'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function Signup() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const next = safeNext(params.get('next'))

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [agree, setAgree] = useState(false)
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  useEffect(() => {
    if (session) navigate(next, { replace: true })
  }, [session, next, navigate])

  const pw = checkPassword(password, email)
  const errors = {
    name: name.trim().length < 2 ? 'Enter your name.' : name.length > 80 ? 'Name is too long.' : undefined,
    email: !EMAIL_RE.test(email.trim()) ? 'Enter a valid email address.' : undefined,
    password: !pw.ok ? (pw.problems[0] ?? 'Choose a stronger password.') : undefined,
    confirm: confirm !== password ? "Passwords don't match." : undefined,
    agree: !agree ? 'Please accept the terms to continue.' : undefined,
  }
  const valid = !Object.values(errors).some(Boolean)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setError(null)
    if (!valid || !supabase) return
    setLoading(true)
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim() },
        emailRedirectTo: `${window.location.origin}/login?confirmed=1`,
      },
    })
    setLoading(false)
    if (err) {
      if (err.status === 429) setError('Too many sign-up attempts. Please wait a few minutes and try again.')
      else if (/password/i.test(err.message)) setError('That password is not allowed. It may have appeared in a data breach. Please choose another.')
      else setError("We couldn't create your account. Please check your details and try again.")
      return
    }
    setPassword('')
    setConfirm('')
    if (data.session) {
      navigate(next, { replace: true })
    } else {
      // Same screen whether or not the email already has an account,
      // so sign-up can't be used to discover registered emails.
      setSentTo(email.trim())
    }
  }

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" subtitle={<>We sent a confirmation link to <span className="font-semibold text-white">{sentTo}</span>.</>}>
        <div className="animate-slide-up flex flex-col items-center gap-5 rounded-2xl border border-sky/12 bg-surface p-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-royal">
            <MailCheck size={30} className="text-white" />
          </div>
          <p className="text-[15px] leading-relaxed text-muted">
            Click the link in the email to activate your account. If you don't see it, check your spam folder.
          </p>
          <Link to="/login" className="font-semibold text-periwinkle hover:text-white">
            Back to sign in
          </Link>
        </div>
      </AuthLayout>
    )
  }

  const show = (k: keyof typeof errors) => (touched ? errors[k] : undefined)

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start assessing your website's security in minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link to={`/login${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-periwinkle hover:text-white">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {error && <FormAlert tone="error">{error}</FormAlert>}
        <TextField
          label="Full name"
          name="name"
          autoComplete="name"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={show('name')}
        />
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
          error={show('email')}
          placeholder="you@company.com"
        />
        <div>
          <PasswordField
            label="Password"
            name="new-password"
            autoComplete="new-password"
            required
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={show('password')}
          />
          <PasswordStrength password={password} email={email} />
        </div>
        <PasswordField
          label="Confirm password"
          name="confirm-password"
          autoComplete="new-password"
          required
          maxLength={128}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={show('confirm')}
        />
        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-muted">
            <input
              type="checkbox"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5 h-4.5 w-4.5 shrink-0 cursor-pointer accent-royal"
            />
            <span>
              I agree to the Terms of Service and Privacy Policy, and I will only scan websites I own or have permission
              to assess.
            </span>
          </label>
          {show('agree') && <p className="mt-1.5 text-xs text-fail">{errors.agree}</p>}
        </div>
        <SubmitButton loading={loading} disabled={!supabase}>
          Create account
        </SubmitButton>
      </form>
    </AuthLayout>
  )
}
