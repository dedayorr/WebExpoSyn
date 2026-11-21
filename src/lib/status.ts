import type { CheckStatus, Severity } from '@/types'

export const statusStyles: Record<CheckStatus, { label: string; text: string; border: string; bg: string; solid: string }> = {
  pass: { label: 'Passed', text: 'text-pass', border: 'border-pass/45', bg: 'bg-pass/10', solid: 'bg-pass' },
  fail: { label: 'Failed', text: 'text-fail', border: 'border-fail/45', bg: 'bg-fail/10', solid: 'bg-fail' },
  warn: { label: 'Warning', text: 'text-warn', border: 'border-warn/45', bg: 'bg-warn/10', solid: 'bg-warn' },
  unverified: { label: "Couldn't verify", text: 'text-sky', border: 'border-sky/40', bg: 'bg-sky/10', solid: 'bg-sky' },
}

export const severityStyles: Record<Severity, { label: string; className: string }> = {
  critical: { label: 'Critical', className: 'bg-fail text-[#2a0c08]' },
  high: { label: 'High', className: 'bg-high text-[#2a1405]' },
  medium: { label: 'Medium', className: 'bg-warn text-[#2a1f05]' },
  low: { label: 'Low', className: 'bg-sky text-navy' },
  info: { label: 'Info', className: 'bg-sky/20 text-sky' },
  none: { label: 'Pass', className: 'bg-pass/15 text-pass' },
}
