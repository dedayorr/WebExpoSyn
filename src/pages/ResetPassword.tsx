import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FormAlert, PasswordField, PasswordStrength, SubmitButton } from '@/components/auth/fields'
import { useAuth } from '@/auth/AuthProvider'
import { checkPassword } from '@/lib/password'
import { supabase } from '@/lib/supabase'

/**
 * Landing page for the password-reset email link. Supabase exchanges the
 * one-time code in the URL for a short-lived recovery session; only then can
 * the password be changed.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const { session, recovering, loading: authLoading, user } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pw = checkPassword(password, user?.email ?? '')
  const pwError = !pw.ok ? (pw.problems[0] ?? 'Choose a stronger password.') : undefined
  const confirmError = confirm !== password ? "Passwords don't match." : undefined
  // Only a recovery session from the email link may set a new password here.
  // An ordinary signed-in session must not change the password without the
  // old one, otherwise a hijacked session could take over the account.
  const canReset = !!session && recovering

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setError(null)
    if (!supabase || pwError || confirmError) return
    setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) {
      setError(
        /different from the old/i.test(err.message)
          ? 'Your new password must be different from your old one.'
          : "We couldn't update your password. The link may have expired; request a new one.",
      )
      return
    }
    // End every session so a stolen session can't outlive the reset.
    await supabase.auth.signOut({ scope: 'global' })
    navigate('/login?reset=1', { replace: true })
  }

  if (!authLoading && !canReset) {
    return (
      <AuthLayout title="Link expired or invalid" subtitle="Password reset links work once and expire after an hour.">
        <Link
          to="/forgot-password"
          className="inline-flex h-12 w-full items-center justify-center rounded-[10px] bg-royal font-semibold text-white hover:bg-royal-hover"
        >
          Request a new link
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Use at least 10 characters. A short phrase of several words works well.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
        {error && <FormAlert tone="error">{error}</FormAlert>}
        <div>
          <PasswordField
            label="New password"
            name="new-password"
            autoComplete="new-password"
            required
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={touched ? pwError : undefined}
          />
          <PasswordStrength password={password} email={user?.email} />
        </div>
        <PasswordField
          label="Confirm new password"
          name="confirm-password"
          autoComplete="new-password"
          required
          maxLength={128}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={touched ? confirmError : undefined}
        />
        <SubmitButton loading={loading}>Update password</SubmitButton>
      </form>
    </AuthLayout>
  )
}
