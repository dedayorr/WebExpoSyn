import { useState } from 'react'
import { ArrowRight, ChevronDown, GitCompare } from 'lucide-react'
import { StatusBadge } from '@/components/ui/badges'
import { formatDate } from '@/lib/modules'
import { cn } from '@/lib/utils'
import type { CheckStatus, ScanReport } from '@/types'

interface Change {
  id: string
  title: string
  before?: CheckStatus
  after?: CheckStatus
}

/** Finding-by-finding differences between two scans of the same site. */
export function diffReports(previous: ScanReport, current: ScanReport): Change[] {
  const before = new Map(previous.findings.map((f) => [f.id, f]))
  const after = new Map(current.findings.map((f) => [f.id, f]))
  const changes: Change[] = []
  for (const [id, f] of after) {
    const old = before.get(id)
    if (!old) changes.push({ id, title: f.title, after: f.status })
    else if (old.status !== f.status) changes.push({ id, title: f.title, before: old.status, after: f.status })
  }
  for (const [id, f] of before) if (!after.has(id)) changes.push({ id, title: f.title, before: f.status })
  return changes
}

/**
 * Shows what changed since the previous scan of this site, so differences
 * between rescans are explained instead of mysterious.
 */
export function ScanComparison({ previous, current }: { previous: ScanReport; current: ScanReport }) {
  const changes = diffReports(previous, current)
  const [open, setOpen] = useState(changes.length > 0 && changes.length <= 6)
  const flaky = changes.filter((c) => c.before === 'unverified' || c.after === 'unverified').length

  return (
    <section className="animate-slide-up mt-6 rounded-[18px] border border-sky/12 bg-surface print:hidden">
      <button
        onClick={() => changes.length && setOpen((o) => !o)}
        aria-expanded={open}
        className={cn('flex w-full items-center gap-3 px-5 py-4 text-left', changes.length && 'cursor-pointer')}
      >
        <GitCompare size={18} className="shrink-0 text-periwinkle" />
        <span className="min-w-0 flex-1 text-[15px] text-ink">
          {changes.length === 0 ? (
            <>Same results as your previous scan on {formatDate(previous.completedAt)}.</>
          ) : (
            <>
              <span className="font-semibold text-white">
                {changes.length} change{changes.length > 1 ? 's' : ''}
              </span>{' '}
              since your previous scan on {formatDate(previous.completedAt)}
            </>
          )}
        </span>
        {changes.length > 0 && <ChevronDown size={18} className={cn('text-periwinkle transition-transform duration-300', open && 'rotate-180')} />}
      </button>
      {changes.length > 0 && (
        <div className="accordion" data-open={open}>
          <div>
            <ul className="flex flex-col gap-2 border-t border-sky/8 px-5 py-4">
              {changes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                  <span className="min-w-0 flex-[1_1_220px] text-ink">{c.title}</span>
                  <span className="flex items-center gap-2">
                    {c.before ? <StatusBadge status={c.before} /> : <span className="text-xs text-subtle">new check</span>}
                    <ArrowRight size={14} className="text-subtle" />
                    {c.after ? <StatusBadge status={c.after} /> : <span className="text-xs text-subtle">not run</span>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="border-t border-sky/8 px-5 py-3 text-xs leading-relaxed text-subtle">
              Results change when your site's configuration changes.
              {flaky > 0 &&
                ` ${flaky} of these moved to or from "couldn't verify": that usually means a check couldn't finish because of a network hiccup, not that your site changed. Rescan to confirm.`}
            </p>
          </div>
        </div>
      )}
    </section>
  )
}
