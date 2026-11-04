import { Outlet } from 'react-router-dom'

import { BackgroundSpotlight } from './BackgroundSpotlight'
import { PublicHeader } from './PublicHeader'
import { ScrollToTop } from './ScrollToTop'
import { SiteFooter } from './SiteFooter'
import { TalkToSky } from './TalkToSky'

/** Landing, login and sign-up pages: no login needed. */
export function PublicLayout() {
  return (
    <div className="landing-page landing-rest relative isolate flex min-h-screen flex-col">
      <ScrollToTop />
      <BackgroundSpotlight />
      <PublicHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
      <TalkToSky />
    </div>
  )
}
