import { ClipboardCheck, FileSearch, Gavel, Send, type LucideIcon } from 'lucide-react'

/** DataQs build plan: docs/DataQ.md. Phase 0 shows what the service is; cases come next. */

type Audience = 'carrier' | 'staff'

interface Step {
  icon: LucideIcon
  title: string
  carrier: string
  staff: string
}

const STEPS: Step[] = [
  {
    icon: FileSearch,
    title: 'Request a review',
    carrier:
      'Pick the inspection or violation you believe is wrong, tell us why and upload your evidence.',
    staff: 'The carrier picks the record, the reason and the evidence, and signs an authorization.',
  },
  {
    icon: ClipboardCheck,
    title: 'STS assesses it',
    carrier:
      'A specialist checks the record, the timing and your evidence, and asks for anything missing.',
    staff:
      'Assign a specialist; check authority, record identity, timing, duplicates and evidence.',
  },
  {
    icon: Send,
    title: 'You approve, we file',
    carrier: 'You approve the exact request package; STS files it with FMCSA’s DataQs for you.',
    staff:
      'The carrier approves the exact package; file it in DataQs and record the request ID and receipt.',
  },
  {
    icon: Gavel,
    title: 'Track the decision',
    carrier:
      'Follow agency questions, decisions and appeal options, until the record changes in FMCSA data.',
    staff:
      'Record agency correspondence, deadlines, decisions and appeals; verify the correction in FMCSA data.',
  },
]

export function DataQsIntro({
  audience,
  folded = false,
}: {
  audience: Audience
  folded?: boolean
}) {
  const steps = (
    <>
      <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-strong">
              <step.icon className="size-4" aria-hidden />
            </span>
            <div>
              <div className="text-sm font-medium text-slate-900">
                {i + 1}. {step.title}
              </div>
              <p className="mt-0.5 text-sm text-slate-600">{step[audience]}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-5 border-t border-slate-100 pt-4 text-xs text-slate-600">
        A state agency reviews each request and decides it; filing a request does not guarantee a
        record will be changed or removed.
      </p>
    </>
  )
  if (folded) {
    return (
      <details className="rounded-2xl border border-slate-200 bg-surface p-5">
        <summary className="cursor-pointer text-sm font-semibold text-slate-900">
          How DataQs requests work
        </summary>
        {steps}
      </details>
    )
  }
  return (
    <section className="rounded-2xl border border-slate-200 bg-surface p-5">
      <h2 className="text-sm font-semibold text-slate-900">How it works</h2>
      {steps}
    </section>
  )
}
