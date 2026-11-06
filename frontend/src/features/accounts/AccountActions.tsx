import { useState, type ReactNode } from 'react'

import { StatusBadge } from '../../components/StatusBadge'
import { useAccountAction, useDeleteAccount, useReleaseClaim } from '../../hooks/useAccounts'
import type { AdminUser } from '../../types/auth'

const OUTLINE =
  'whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-semibold ring-1 disabled:opacity-50'

/**
 * The row's Actions column: Disable (or Re-activate) and Delete. Disable and Delete ask first, in
 * a pop-up that says what will happen; if the server refuses, the pop-up shows why.
 */
export function AccountActions({
  account,
  withCompany,
}: {
  account: AdminUser
  /** Deleting it also removes its company (the company's only account, not STS) */
  withCompany: boolean
}) {
  const [pending, setPending] = useState<'disable' | 'delete' | null>(null)
  const action = useAccountAction()
  const remove = useDeleteAccount()

  function open(next: 'disable' | 'delete') {
    action.reset()
    remove.reset()
    setPending(next)
  }

  function close() {
    setPending(null)
    action.reset()
    remove.reset()
  }

  return (
    <div className="flex justify-end gap-1.5">
      {account.status === 'DISABLED' ? (
        <button
          type="button"
          disabled={action.isPending}
          onClick={() => {
            action.reset()
            action.mutate({ id: account.id, action: 'reactivate' })
          }}
          className={`${OUTLINE} text-emerald-700 ring-emerald-600 hover:bg-emerald-50`}
        >
          {action.isPending ? 'Re-activating…' : 'Re-activate'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => open('disable')}
          className={`${OUTLINE} text-slate-700 ring-slate-300 hover:bg-slate-50`}
        >
          Disable
        </button>
      )}
      <button
        type="button"
        onClick={() => open('delete')}
        className={`${OUTLINE} text-red-700 ring-red-600 hover:bg-red-50`}
      >
        Delete
      </button>

      {/* Re-activate has no pop-up: if it fails, say why in one. */}
      {action.isError && !pending && (
        <ConfirmDialog
          title="That didn’t work"
          error={action.error.message}
          busy={false}
          onCancel={close}
        >
          {account.full_name}’s account was not changed.
        </ConfirmDialog>
      )}
      {pending === 'disable' && (
        <ConfirmDialog
          title={`Disable ${account.full_name}?`}
          confirm="Disable"
          busy={action.isPending}
          error={action.isError ? action.error.message : null}
          onCancel={close}
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
      {pending === 'delete' && (
        <ConfirmDialog
          title={`Delete ${account.full_name} for good?`}
          confirm="Delete account"
          busy={remove.isPending}
          error={remove.isError ? remove.error.message : null}
          onCancel={close}
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

/**
 * The Claim column: each USDOT this carrier account has claimed (no other carrier account can
 * sign up with it), with Release, which asks first. The account keeps the carrier in its portal.
 */
export function ClaimCell({ account }: { account: AdminUser }) {
  const [releasing, setReleasing] = useState<number | null>(null)
  const release = useReleaseClaim()
  const claimed = account.claimed_usdot_numbers ?? []

  if (claimed.length === 0) return <span className="text-xs text-slate-400">—</span>

  function close() {
    setReleasing(null)
    release.reset()
  }

  return (
    <div className="space-y-1.5">
      {claimed.map((usdot) => (
        <div key={usdot} className="flex flex-wrap items-center gap-1.5">
          <StatusBadge label="Claimed" tone="ok" />
          {claimed.length > 1 && <span className="font-mono text-xs text-slate-600">{usdot}</span>}
          <button
            type="button"
            onClick={() => {
              release.reset()
              setReleasing(usdot)
            }}
            title="Free this USDOT number so another carrier account can sign up with it."
            className={`${OUTLINE} text-slate-700 ring-slate-300 hover:bg-slate-50`}
          >
            Release
          </button>
        </div>
      ))}
      {releasing !== null && (
        <ConfirmDialog
          title={`Release the claim on USDOT ${releasing}?`}
          confirm="Release claim"
          busy={release.isPending}
          error={release.isError ? release.error.message : null}
          onCancel={close}
          onConfirm={() =>
            release.mutate(
              { id: account.id, usdotNumber: releasing },
              { onSuccess: () => setReleasing(null) },
            )
          }
        >
          Another carrier account can then sign up with this number. {account.full_name} keeps the
          carrier in their portal.
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
        <p className="mt-2 text-sm font-normal text-slate-600">{children}</p>
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
