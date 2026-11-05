import { useReducedMotion } from 'motion/react'

/*
 * Faint route lines behind the home hero: thin dotted curves across the blue, like routes on a
 * map, with a small light travelling along each one, as a truck would. Drawn behind the hero's
 * content (the hero isolates its stacking, so -z-[1] stays inside it) and ignored by the mouse.
 * With reduced motion the lines stay and the lights are left out.
 */

/** Curves across a 1440 × 800 frame, kept mostly to the sides and the bottom, away from the words. */
const ROUTES = [
  { d: 'M -40 180 C 220 120, 300 420, 520 470 S 860 640, 1100 760', duration: 18, delay: 0 },
  { d: 'M 1480 120 C 1240 200, 1220 420, 1020 500 S 640 560, 420 820', duration: 22, delay: 4 },
  { d: 'M -40 620 C 260 560, 520 700, 760 650 S 1180 520, 1480 600', duration: 26, delay: 9 },
  { d: 'M 120 -20 C 160 160, 60 300, 140 460 S 120 700, 260 820', duration: 20, delay: 2 },
  { d: 'M 1320 -20 C 1260 180, 1400 320, 1300 480 S 1340 700, 1220 820', duration: 24, delay: 6 },
]

export function HeroRoutes() {
  const reduceMotion = useReducedMotion()
  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 800"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 -z-[1] size-full"
    >
      <defs>
        <radialGradient id="hero-route-glow">
          <stop offset="0%" stopColor="var(--hero-highlight)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--hero-highlight)" stopOpacity="0" />
        </radialGradient>
      </defs>
      {ROUTES.map(({ d }) => (
        <path
          key={d}
          d={d}
          fill="none"
          stroke="white"
          strokeOpacity={0.22}
          strokeWidth={1.5}
          strokeDasharray="2 8"
          strokeLinecap="round"
        />
      ))}
      {!reduceMotion &&
        ROUTES.map(({ d, duration, delay }) => (
          <g key={`light-${d}`}>
            <circle r={14} fill="url(#hero-route-glow)">
              <animateMotion
                dur={`${duration}s`}
                begin={`-${delay}s`}
                repeatCount="indefinite"
                path={d}
              />
            </circle>
            <circle r={3.5} fill="var(--hero-highlight)">
              <animateMotion
                dur={`${duration}s`}
                begin={`-${delay}s`}
                repeatCount="indefinite"
                path={d}
              />
            </circle>
          </g>
        ))}
    </svg>
  )
}
