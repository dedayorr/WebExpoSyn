import { useState } from 'react'
import { BookOpen, ChevronDown, Lightbulb } from 'lucide-react'
import { MODULE_LABELS } from '@/lib/modules'
import { MODULE_PLAIN, termsIn } from '@/lib/plainEnglish'
import { cn } from '@/lib/utils'
import type { Finding, ModuleId } from '@/types'

const STORE_KEY = 'wxs:plain-guide-open'

function readOpen() {
  try {
    return localStorage.getItem(STORE_KEY) !== '0'
  } catch {
    return true
  }
}

/** "What do these checks mean?": every module in everyday words. Open by default. */
export function ModuleGuide({ modules }: { modules: ModuleId[] }) {
  const [open, setOpen] = useState(readOpen)
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(STORE_KEY, o ? '0' : '1')
      } catch {
        /* storage unavailable: fine */
      }
      return !o
    })
  }
  return (
    <section className="mt-6 rounded-[18px] border border-sky/12 bg-surface print:hidden" aria-label="What these checks mean">
      <button onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-periwinkle/15 text-periwinkle">
          <BookOpen size={18} />
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-white">What do these checks mean?</span>
          <span className="block text-sm text-muted">Each part of the report, explained in plain English.</span>
        </span>
        <ChevronDown size={20} className={cn('text-periwinkle transition-transform duration-300', open && 'rotate-180')} />
      </button>
      <div className="accordion" data-open={open}>
        <div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-3 border-t border-sky/8 p-4">
            {modules.map((m) => (
              <div key={m} className="rounded-[14px] border border-sky/10 bg-navy-deep/40 p-4">
                <div className="font-mono text-xs text-periwinkle">{MODULE_LABELS[m]}</div>
                <div className="mt-1 text-[15px] font-semibold text-white">{MODULE_PLAIN[m].plainName}</div>
                <p className="mt-2 text-sm leading-relaxed text-ink">{MODULE_PLAIN[m].what}</p>
                <p className="mt-2.5 text-sm leading-relaxed text-sky">
                  <span className="font-semibold text-periwinkle">Think of it like: </span>
                  {MODULE_PLAIN[m].analogy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Shown above the results when one module is selected. */
export function ModuleExplainer({ module }: { module: ModuleId }) {
  const p = MODULE_PLAIN[module]
  return (
    <div className="animate-slide-up flex gap-4 rounded-[16px] border border-periwinkle/30 bg-royal/15 p-4.5">
      <Lightbulb size={22} className="mt-0.5 shrink-0 text-periwinkle" />
      <div>
        <div className="font-semibold text-white">
          {MODULE_LABELS[module]}, in plain English: {p.plainName.toLowerCase()}
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-ink">{p.what}</p>
        <p className="mt-2 text-sm text-sky">
          <span className="font-semibold text-periwinkle">Think of it like: </span>
          {p.analogy}
        </p>
      </div>
    </div>
  )
}

/** Explains the technical terms that appear in one finding. */
export function FindingTerms({ finding }: { finding: Finding }) {
  const terms = termsIn(finding.title, finding.found, finding.why, finding.action).slice(0, 4)
  if (terms.length === 0) return null
  return (
    <div className="col-span-full rounded-[12px] border border-periwinkle/20 bg-periwinkle/8 px-4 py-3.5">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.1em] text-periwinkle uppercase">
        <Lightbulb size={14} /> Words used here, explained
      </div>
      <dl className="mt-2 space-y-1.5">
        {terms.map((t) => (
          <div key={t.term} className="text-sm leading-relaxed">
            <dt className="inline font-semibold text-white">{t.term}: </dt>
            <dd className="inline text-ink">{t.plain}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
