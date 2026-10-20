import type { ReactNode } from 'react'

/** "Source: …": where a value or section comes from. One style everywhere in the app. */
export function SourceTag({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`text-[11px] font-normal normal-case tracking-normal text-slate-400 ${className}`}
    >
      Source: {children}
    </span>
  )
}
