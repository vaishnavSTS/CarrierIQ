import { Plus } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'

import { reveal, SectionHeading } from './landingParts'

export type FaqItem = { q: string; a: string }

/**
 * Questions that open one at a time to show the answer. Also tells search engines what they are
 * (schema.org FAQPage), so use one list per page.
 */
export function FaqList({ items }: { items: FaqItem[] }) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
  return (
    <motion.div
      {...reveal()}
      className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-surface shadow-sm"
    >
      {items.map(({ q, a }) => (
        <details key={q} className="group px-5 py-4 md:px-6">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
            {q}
            <Plus
              className="size-5 shrink-0 text-slate-500 transition-transform group-open:rotate-45"
              aria-hidden
            />
          </summary>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">{a}</p>
        </details>
      ))}
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </motion.div>
  )
}

/** A page's questions under a section heading; put it inside a Band. */
export function FaqSection({
  items,
  title = 'Good to know',
  number,
  aside,
}: {
  items: FaqItem[]
  title?: ReactNode
  number?: string
  aside?: ReactNode
}) {
  return (
    <div>
      <SectionHeading number={number} eyebrow="Questions" title={title} aside={aside} />
      <div className="mt-10">
        <FaqList items={items} />
      </div>
    </div>
  )
}
