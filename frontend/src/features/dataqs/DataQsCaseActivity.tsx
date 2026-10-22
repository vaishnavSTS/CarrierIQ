import { StatusBadge } from '../../components/StatusBadge'
import type { DataQsAssessment, DataQsTask } from '../../types/dataqs'
import { formatDateTime } from '../../utils/format'

const OWNER_LABEL = { CARRIER: 'Carrier', STS: 'STS', AGENCY: 'Agency' } as const

/** Open tasks on the case, oldest first. */
export function DataQsTaskList({ tasks }: { tasks: DataQsTask[] }) {
  const now = Date.now()
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {tasks.map((task) => {
        const overdue = task.due_at !== null && new Date(task.due_at).getTime() < now
        return (
          <li key={task.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
            <span className="w-16 shrink-0 text-xs text-slate-600">
              {OWNER_LABEL[task.action_owner]}
            </span>
            <span className="flex-1">
              <span className="text-slate-900">{task.title}</span>
              {task.detail && (
                <span className="block whitespace-pre-line text-slate-600">{task.detail}</span>
              )}
            </span>
            <span className="text-xs text-slate-600">
              {task.assignee_name && `${task.assignee_name} · `}
              {task.due_at ? `due ${formatDateTime(task.due_at)}` : 'no due date'}
            </span>
            {overdue && <StatusBadge label="Overdue" tone="warn" />}
          </li>
        )
      })}
    </ul>
  )
}

/** Every assessment, newest first. Internal notes arrive only for STS staff. */
export function DataQsAssessmentHistory({ assessments }: { assessments: DataQsAssessment[] }) {
  return (
    <ol className="space-y-3 text-sm">
      {[...assessments].reverse().map((a) => (
        <li key={a.id} className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-900">{a.outcome_label}</span>
            <span className="text-xs text-slate-600">
              {a.assessor_name ?? 'STS'} · {formatDateTime(a.created_at)}
            </span>
          </div>
          {a.carrier_message && <p className="text-slate-700">{a.carrier_message}</p>}
          {a.internal_note && (
            <p className="text-slate-600">
              <span className="text-xs font-medium uppercase text-slate-500">Internal: </span>
              {a.internal_note}
            </p>
          )}
        </li>
      ))}
    </ol>
  )
}
