import { MoreHorizontal } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { useAccountAction, useDeleteAccount, useReleaseClaim } from '../../hooks/useAccounts'
import type { AdminUser } from '../../types/auth'

type Pending = { kind: 'disable' } | { kind: 'delete' } | { kind: 'release'; usdot: number }

/**
 * The row's "⋯" menu: re-activate or disable, release a USDOT claim, delete. Anything that takes
 * access away or can't be undone asks first, in a pop-up that says what will happen.
 */
export function AccountActions({
  account,
  withCompany,
}: {
  account: AdminUser
  /** Deleting it also removes its company (the company's only account, not STS) */
  withCompany: boolean
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const menu = useRef<HTMLDivElement>(null)
  const action = useAccountAction()
  const remove = useDeleteAccount()
  const release = useReleaseClaim()

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !menu.current?.contains(event.target as Node)
      )
        setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  function closePending() {
    setPending(null)
    action.reset()
    remove.reset()
    release.reset()
  }

  function choose(next: Pending | 'reactivate') {
    setOpen(false)
    action.reset()
    remove.reset()
    release.reset()
    if (next === 'reactivate') action.mutate({ id: account.id, action: 'reactivate' })
    else setPending(next)
  }

  const claimed = account.claimed_usdot_numbers ?? []
  const item =
    'block w-full whitespace-nowrap px-3 py-1.5 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none'

  return (
    <div ref={menu} className="relative inline-block text-left">
      <button
        type="button"
        aria-label={`Actions for ${account.full_name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="grid size-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-48 overflow-hidden rounded-lg border border-slate-200 bg-surface py-1 shadow-lg"
        >
          {account.status === 'DISABLED' ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => choose('reactivate')}
              className={`${item} text-slate-800`}
            >
              Re-activate
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => choose({ kind: 'disable' })}
              className={`${item} text-slate-800`}
            >
              Disable
            </button>
          )}
          {claimed.map((usdot) => (
            <button
              key={usdot}
              type="button"
              role="menuitem"
              onClick={() => choose({ kind: 'release', usdot })}
              className={`${item} text-slate-800`}
            >
              Release claim on {usdot}
            </button>
          ))}
          <div className="my-1 border-t border-slate-100" />
          <button
            type="button"
            role="menuitem"
            onClick={() => choose({ kind: 'delete' })}
            className={`${item} text-red-700`}
          >
            Delete account…
          </button>
        </div>
      )}

      {/* Re-activate has no pop-up: if it fails, say why in one. */}
      {action.isError && !pending && (
        <ConfirmDialog
          title="That didn’t work"
          error={action.error.message}
          busy={false}
          onCancel={() => action.reset()}
        >
          {account.full_name}’s account was not changed.
        </ConfirmDialog>
      )}

      {pending?.kind === 'disable' && (
        <ConfirmDialog
          title={`Disable ${account.full_name}?`}
          confirm="Disable"
          busy={action.isPending}
          error={action.isError ? action.error.message : null}
          onCancel={closePending}
          onConfirm={() =>
            action.mutate(
              { id: account.id, action: 'disable' },
              { onSuccess: () => setPending(null) },
            )
          }
        >
          They can no longer log in. Everything stays as it is, and you can re-activate the account
          later.
        </ConfirmDialog>
      )}
      {pending?.kind === 'release' && (
        <ConfirmDialog
          title={`Release the claim on USDOT ${pending.usdot}?`}
          confirm="Release claim"
          busy={release.isPending}
          error={release.isError ? release.error.message : null}
          onCancel={closePending}
          onConfirm={() =>
            release.mutate(
              { id: account.id, usdotNumber: pending.usdot },
              { onSuccess: () => setPending(null) },
            )
          }
        >
          Another carrier account can then sign up with this number. {account.full_name} keeps the
          carrier in their portal.
        </ConfirmDialog>
      )}
      {pending?.kind === 'delete' && (
        <ConfirmDialog
          title={`Delete ${account.full_name} for good?`}
          confirm="Delete account"
          busy={remove.isPending}
          error={remove.isError ? remove.error.message : null}
          onCancel={closePending}
          onConfirm={() => remove.mutate(account.id, { onSuccess: () => setPending(null) })}
        >
          {account.email} will be removed and can’t log in again.
          {withCompany &&
            ` ${account.organization_name} goes too, with its carrier list and USDOT claims, so those numbers can be claimed again.`}{' '}
          This can’t be undone. Accounts with DataQs work, service requests or invoices can only be
          disabled.
        </ConfirmDialog>
      )}
    </div>
  )
}

/** Asks before acting. If the server refuses, it stays open with the reason and only Close. */
function ConfirmDialog({
  title,
  confirm,
  busy,
  error,
  onConfirm,
  onCancel,
  children,
}: {
  title: string
  confirm?: string
  busy: boolean
  error?: string | null
  onConfirm?: () => void
  onCancel: () => void
  children: ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 text-left"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-surface p-6 shadow-2xl">
        <h2 id="confirm-title" className="text-base font-semibold text-slate-950">
          {title}
        </h2>
        <p className="mt-2 text-sm text-slate-600">{children}</p>
        {error && (
          <p role="alert" className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50"
          >
            {error ? 'Close' : 'Cancel'}
          </button>
          {!error && confirm && onConfirm && (
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className="rounded-md bg-red-700 px-3 py-1.5 text-sm font-semibold text-surface shadow-sm hover:bg-red-800 disabled:opacity-50"
            >
              {busy ? 'Working…' : confirm}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
