import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import type { LegalDocument } from './legalText'

/** The Terms of Service or the Privacy Policy, read in a pop-up without leaving the sign-up form. */
export function LegalDialog({
  document: legal,
  onClose,
}: {
  document: LegalDocument
  onClose: () => void
}) {
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    close.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // On the page itself, not inside the sign-up card, whose styling would box a fixed overlay in.
  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[88vh] w-full min-w-0 max-w-2xl flex-col rounded-3xl bg-surface shadow-2xl ring-1 ring-black/5">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <h2 id="legal-title" className="text-lg font-semibold tracking-tight text-slate-900">
            {legal.title}
          </h2>
          <button
            ref={close}
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5 text-sm leading-relaxed break-words text-slate-700">
          {legal.sections.map((section) => (
            <section key={section.heading} className="mt-5 first:mt-0">
              <h3 className="font-semibold text-slate-900">{section.heading}</h3>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="mt-1.5">
                  {paragraph}
                </p>
              ))}
              {section.table && (
                <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-canvas text-slate-500">
                      <tr>
                        {section.table.head.map((cell) => (
                          <th key={cell} className="px-3 py-2 font-medium">
                            {cell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {section.table.rows.map((row) => (
                        <tr key={row[0]}>
                          {row.map((cell, i) => (
                            <td
                              key={i}
                              className={
                                i === 0 ? 'px-3 py-2 font-medium text-slate-900' : 'px-3 py-2'
                              }
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          ))}
        </div>
        <div className="border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="block w-full rounded-xl border border-slate-300 px-4 py-2.5 text-center text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50 sm:ml-auto sm:w-auto sm:px-6"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
