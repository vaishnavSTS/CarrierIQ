import type { PortalTone } from '../../components/layout/PortalShell'
import { HeroBoard } from '../dashboard/HeroBoard'
import { HERO_PHOTO } from '../landing/photos'

const PHOTO: Record<PortalTone, string> = {
  carrier: HERO_PHOTO.carrier,
  broker: HERO_PHOTO.broker,
  agent: HERO_PHOTO.agent,
}

/**
 * Behind each portal's welcome banner: the audience's real hero photo, toned into the portal's
 * colour and darkened behind the text, plus one moving touch of its own — lane markings rolling
 * past for carriers, the load board for brokers, a slow light sweep for insurance agents.
 * Decorative only; nothing moves for people who prefer reduced motion.
 */
export function PortalHeroBackdrop({ tone }: { tone: PortalTone }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <img
        src={PHOTO[tone]}
        alt=""
        className="portal-hero-photo absolute inset-y-0 right-0 h-full w-full object-cover opacity-60 md:w-[70%]"
      />
      <div className="portal-hero-tint absolute inset-0" />
      <div className="portal-hero-scrim absolute inset-0" />
      {tone === 'broker' && (
        <div className="opacity-60">
          <HeroBoard signals={undefined} />
        </div>
      )}
      {tone === 'carrier' && (
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/45 to-transparent">
          <div className="portal-road absolute inset-x-0 bottom-4 h-[3px]" />
        </div>
      )}
      {tone === 'agent' && <div className="portal-sweep absolute inset-y-0 left-0 w-1/3" />}
    </div>
  )
}
