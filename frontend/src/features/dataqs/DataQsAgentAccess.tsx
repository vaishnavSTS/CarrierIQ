import { ExternalLink, UserCheck } from 'lucide-react'

import { useDataQsAgentAccess } from '../../hooks/useDataQs'
import type { DataQsAgentAccessStatus, DataQsCase } from '../../types/dataqs'
import { formatDateTime } from '../../utils/format'
import { primaryButton, secondaryButton } from './ui'

const PORTAL = 'https://portal.fmcsa.dot.gov/login'
const ROLES = '“Modify Company Information” and “View Sensitive Company Information”'

/** STS's queue: a case whose carrier chose to authorize STS as an agent. */
export function AgentAccessBadge({ status }: { status: DataQsAgentAccessStatus | null }) {
  if (!status || status === 'GRANTED') return null
  return (
    <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
      <UserCheck className="size-3.5" aria-hidden />
      {status === 'REQUESTED'
        ? 'Client requested authorized access'
        : 'Access request sent: waiting for the client'}
    </span>
  )
}

/** The carrier: where STS's access request stands, how to approve it, and "I approved it". */
export function DataQsAgentAccessCard({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const act = useDataQsAgentAccess(c.id)
  const a = c.agent
  if (!a) return null
  if (a.status === 'GRANTED') {
    return (
      <p className="rounded-lg bg-emerald-50 p-3 text-emerald-800">
        You approved STS’s access on {formatDateTime(a.granted_at)}. STS files with its own login;
        no codes are needed.
      </p>
    )
  }
  if (a.status === 'REQUESTED') {
    return (
      <p className="rounded-lg bg-slate-50 p-3 text-slate-700">
        STS will request access to USDOT {c.usdot_number} in the FMCSA Portal. You’ll get an email
        and see the steps here when it’s ready for you to approve.
      </p>
    )
  }
  return (
    <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <p className="font-semibold text-amber-900">
        Approve STS’s access request in the FMCSA Portal
      </p>
      <p className="text-amber-900">
        STS requested access to USDOT {c.usdot_number} on {formatDateTime(a.sent_at)}. Your
        company’s Company Official approves it:
      </p>
      <ol className="list-decimal space-y-1 pl-5 text-slate-800">
        <li>
          Sign in to the{' '}
          <a
            href={PORTAL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-accent-strong hover:underline"
          >
            FMCSA Portal
            <ExternalLink className="size-3" aria-hidden />
          </a>{' '}
          as the Company Official.
        </li>
        <li>
          Open <span className="font-medium">Account Management</span>. Under{' '}
          <span className="font-medium">Pending Account Requests</span>, open the request from Sky
          Transport Solutions (the magnifying glass).
        </li>
        <li>
          Check the roles include {ROLES}. If View Sensitive Company Information is missing, choose
          it under Available Roles and click <span className="font-medium">Add Role</span>.
        </li>
        <li>
          Click <span className="font-medium">Approve Request</span>.
        </li>
      </ol>
      {act.isError && (
        <p className="text-red-700" role="alert">
          Could not save: {act.error.message}
        </p>
      )}
      {c.can_set_otp_preference && (
        <button
          type="button"
          className={primaryButton}
          disabled={act.isPending}
          onClick={() => act.mutate('granted')}
        >
          I approved it
        </button>
      )}
    </div>
  )
}

/** STS: request access in the FMCSA Portal, tell the client, remind them, confirm it. */
export function DataQsAgentAccessStaff({ dataqsCase: c }: { dataqsCase: DataQsCase }) {
  const act = useDataQsAgentAccess(c.id)
  const a = c.agent
  if (!a) return null
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-900">Authorized access in the FMCSA Portal</span>
        <AgentAccessBadge status={a.status} />
        {a.status === 'GRANTED' && (
          <span className="text-emerald-700">Approved {formatDateTime(a.granted_at)}</span>
        )}
      </div>
      {a.status === 'REQUESTED' && (
        <ol className="list-decimal space-y-1 pl-5 text-slate-700">
          <li>
            Sign in to the{' '}
            <a
              href={PORTAL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-accent-strong hover:underline"
            >
              FMCSA Portal
              <ExternalLink className="size-3" aria-hidden />
            </a>{' '}
            with STS’s Login.gov account.
          </li>
          <li>
            Request associate access for USDOT <span className="font-mono">{c.usdot_number}</span>{' '}
            with the roles {ROLES}.
          </li>
          <li>Press the button below: the client is emailed how to approve it.</li>
        </ol>
      )}
      {a.status === 'SENT' && (
        <p className="text-slate-700">
          Sent {formatDateTime(a.sent_at)}
          {a.sent_by_name && ` by ${a.sent_by_name}`}.
          {a.reminders > 0 &&
            ` ${a.reminders} reminder${a.reminders === 1 ? '' : 's'}, last ${formatDateTime(a.reminded_at)}.`}{' '}
          Waiting for the client to approve it.
        </p>
      )}
      {act.isError && (
        <p className="text-red-700" role="alert">
          Could not save: {act.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {a.status === 'REQUESTED' && (
          <button
            type="button"
            className={primaryButton}
            disabled={act.isPending}
            onClick={() => act.mutate('sent')}
          >
            Request for authorization sent
          </button>
        )}
        {a.status === 'SENT' && (
          <>
            <button
              type="button"
              className={secondaryButton}
              disabled={act.isPending}
              onClick={() => act.mutate('remind')}
            >
              Send reminder to client
            </button>
            <button
              type="button"
              className={primaryButton}
              disabled={act.isPending}
              onClick={() => act.mutate('granted')}
            >
              Access approved: mark it granted
            </button>
          </>
        )}
      </div>
    </div>
  )
}
