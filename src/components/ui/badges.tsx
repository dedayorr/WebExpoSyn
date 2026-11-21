import { cn } from '@/lib/utils'
import { severityStyles, statusStyles } from '@/lib/status'
import type { CheckStatus, Severity } from '@/types'

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  const s = severityStyles[severity]
  return (
    <span
      className={cn(
        'inline-block min-w-18.5 rounded-md px-2.5 py-1 text-center text-[11px] font-bold uppercase tracking-wide',
        s.className,
        className,
      )}
    >
      {s.label}
    </span>
  )
}

export function StatusBadge({ status }: { status: CheckStatus }) {
  const s = statusStyles[status]
  return (
    <span className={cn('rounded-[7px] border px-2.5 py-1 text-xs font-semibold', s.text, s.border)}>{s.label}</span>
  )
}
