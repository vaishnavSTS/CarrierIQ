import { useEffect } from 'react'
import { useParams } from 'react-router-dom'

import { PacketSection } from '../features/carrier-profile/packet/PacketSection'
import { useCarrierProfile } from '../hooks/useCarrierProfile'
import { PortalModeContext, ReportRenderContext } from '../hooks/usePortalMode'

/**
 * Score Card Sharing API: the Safety Score Report alone, for the server's headless browser to
 * print as a PDF (backend services/report_render.py). It shows the report as a broker sees it
 * (no "Fix with Sky" buttons) and reads the carrier with the report pass the browser adds, so it
 * works only while the server is printing it.
 *
 * <body data-report-ready> once the report is laid out on its A4 pages; data-report-error="…"
 * when it can't be built.
 */
export function ReportRenderPage() {
  const { usdot = '' } = useParams()
  return (
    <ReportRenderContext.Provider value>
      <PortalModeContext.Provider value="broker">
        <Report usdotNumber={Number(usdot)} />
      </PortalModeContext.Provider>
    </ReportRenderContext.Provider>
  )
}

function Report({ usdotNumber }: { usdotNumber: number }) {
  const { data: profile, error } = useCarrierProfile(usdotNumber)

  useEffect(() => {
    if (error) document.body.dataset.reportError = error.message
  }, [error])

  // Ready once the fonts have loaded and paginateReport has filled the A4 pages.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const fontsLoaded = !document.fonts || document.fonts.status === 'loaded'
      const laidOut = fontsLoaded && document.querySelector('#carrier-packet-pages .print-page')
      const failed = document
        .querySelector('#carrier-packet')
        ?.textContent?.includes('Could not load every section')
      if (failed) document.body.dataset.reportError = 'Some sections could not be loaded'
      else if (laidOut) document.body.dataset.reportReady = ''
    }, 250)
    return () => window.clearInterval(timer)
  }, [])

  if (error) return <p className="p-8 text-sm text-red-700">{error.message}</p>
  if (!profile) return <p className="p-8 text-sm text-slate-500">Building the report…</p>
  return (
    <main className="mx-auto max-w-5xl p-6">
      <PacketSection profile={profile} />
    </main>
  )
}
