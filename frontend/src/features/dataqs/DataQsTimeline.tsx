import type { DataQsTimelineEvent } from '../../types/dataqs'
import { formatDateTime } from '../../utils/format'

/** What happened on the case, newest first. */
export function DataQsTimeline({ events }: { events: DataQsTimelineEvent[] }) {
  return (
    <ol className="space-y-3 text-sm">
      {events.map((event, i) => (
        <li key={`${event.at}-${i}`} className="flex flex-wrap gap-x-3">
          <span className="w-full shrink-0 text-xs text-slate-600 sm:w-40">
            {formatDateTime(event.at)}
          </span>
          <span className="flex-1">
            <span className="text-slate-900">{event.title}</span>
            {event.detail && (
              <span className="mt-0.5 block whitespace-pre-line text-slate-600">
                {event.detail}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}
