import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from '@/components/auth/AuthLayout'
import { FormAlert, SubmitButton, TextField } from '@/components/auth/fields'
import { supabase } from '@/lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!supabase || !email.trim()) return
    setLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setLoading(false)
    if (err?.status === 429) {
      setError('Too many requests. Please wait a few minutes and try again.')
      return
    }
    // Always show the same message, whether or not the account exists.
    setSent(true)
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your account email and we'll send you a secure link to choose a new password."
      footer={
        <Link to="/login" className="font-semibold text-periwinkle hover:text-white">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <FormAlert tone="success">
          If an account exists for <span className="font-semibold text-white">{email.trim()}</span>, you'll receive a reset
          link shortly. The link expires after one hour.
        </FormAlert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
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
          <SubmitButton loading={loading} disabled={!supabase || !email}>
            Send reset link
          </SubmitButton>
        </form>
      )}
    </AuthLayout>
  )
}
