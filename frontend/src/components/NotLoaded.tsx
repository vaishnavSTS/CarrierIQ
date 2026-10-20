import { useIsClientPortal } from '../hooks/usePortalMode'

/**
 * The empty state for data CarrierSafetyScan has not fetched yet. Staff can refresh the carrier
 * themselves; clients and brokers have no Refresh button, so they are told it comes with the next
 * data refresh.
 */
export function NotLoaded({ what = 'This' }: { what?: string }) {
  const client = useIsClientPortal()
  return (
    <p className="text-sm text-slate-500">
      {client
        ? `${what} is not available yet; CarrierSafetyScan adds it with its next data refresh.`
        : `${what} is not loaded yet. Use Refresh now at the top of the page.`}
    </p>
  )
}
