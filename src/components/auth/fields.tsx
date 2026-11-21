import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { checkPassword } from '@/lib/password'

const inputClass =
  'h-12 w-full rounded-[10px] border bg-surface px-3.5 text-[15px] text-white placeholder:text-subtle transition-colors focus:border-periwinkle focus:outline-none focus:ring-2 focus:ring-periwinkle/30'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: ReactNode
}

export function TextField({ label, error, hint, className, ...props }: FieldProps) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        className={cn(inputClass, error ? 'border-fail/60' : 'border-sky/20')}
        {...props}
      />
      {hint && !error && <div className="mt-1.5 text-xs text-subtle">{hint}</div>}
      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-xs text-fail">
          {error}
        </p>
      )}
    </div>
  )
}

export function PasswordField({ label, error, hint, className, ...props }: FieldProps) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between">
        <label htmlFor={id} className="block text-sm font-medium text-ink">
          {label}
        </label>
        {hint}
      </div>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          className={cn(inputClass, 'pr-12', error ? 'border-fail/60' : 'border-sky/20')}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute top-1/2 right-1.5 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-subtle hover:bg-sky/10 hover:text-white"
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && (
        <p id={`${id}-err`} className="mt-1.5 text-xs text-fail">
          {error}
        </p>
      )}
    </div>
  )
}

const meterColors = ['bg-fail', 'bg-fail', 'bg-warn', 'bg-periwinkle', 'bg-pass']

export function PasswordStrength({ password, email }: { password: string; email?: string }) {
  if (!password) return null
  const check = checkPassword(password, email)
  return (
    <div className="mt-2.5" aria-live="polite">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn('h-1.5 flex-1 rounded-full transition-colors duration-300', i < Math.max(1, check.score) ? meterColors[check.score] : 'bg-sky/12')}
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-subtle">
        Strength: <span className="font-semibold text-ink">{check.label}</span>
        {check.problems[0] && <span className="text-warn"> · {check.problems[0]}</span>}
      </p>
    </div>
  )
}

export function FormAlert({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  const Icon = tone === 'error' ? AlertCircle : CheckCircle2
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'animate-slide-up flex gap-3 rounded-xl border p-3.5 text-sm leading-relaxed',
        tone === 'error' ? 'border-fail/40 bg-fail/10 text-ink' : 'border-pass/40 bg-pass/10 text-ink',
      )}
    >
      <Icon size={18} className={cn('mt-0.5 shrink-0', tone === 'error' ? 'text-fail' : 'text-pass')} />
      <div>{children}</div>
    </div>
  )
}

export function SubmitButton({ loading, children, disabled }: { loading: boolean; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-royal text-[15px] font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-royal-hover hover:shadow-[0_10px_30px_rgba(27,44,193,0.45)] disabled:pointer-events-none disabled:opacity-60"
    >
      {loading && <Loader2 size={18} className="animate-spin" />}
      {children}
    </button>
  )
}
