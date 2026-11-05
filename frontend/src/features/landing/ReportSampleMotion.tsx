import { animate, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

/*
 * Motion laid over page 1 of the sample report (report-sample-1.webp, 1191 × 1684): when the page
 * scrolls into view, the Estimated ISS dial fills from the left, its needle swings up to 68 while
 * the number counts up, and the two out-of-service bars grow to their rates. Each moving part is
 * drawn over a white patch that hides the picture's own still copy, in the picture's coordinates,
 * so it scales with the image. At the end it looks exactly like the picture; with reduced motion
 * nothing is drawn and the picture shows as it is.
 */

const W = 1191
const H = 1684

/** The dial in the picture: centre, radius of the coloured band, needle length and colour. */
const DIAL = { cx: 196, cy: 424, r: 82, needle: 64, value: 68, colour: '#da770d' }

/** The bars in the picture: track from x 57 to 672 on a 0–50% scale. */
const BAR = { x: 57, width: 615, height: 12 }
const BARS = [
  { y: 1093, rate: 27.3, national: 22.3 },
  { y: 1170, rate: 28.6, national: 6.7 },
]

const toX = (rate: number) => BAR.x + (Math.min(rate, 50) / 50) * BAR.width

function needleEnd(value: number): [number, number] {
  const angle = Math.PI * (1 - value / 100)
  return [DIAL.cx + DIAL.needle * Math.cos(angle), DIAL.cy - DIAL.needle * Math.sin(angle)]
}

export function ReportSampleMotion() {
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true, margin: '-15% 0px' })
  const reduceMotion = useReducedMotion()
  const [t, setT] = useState(0)

  useEffect(() => {
    if (!inView || reduceMotion) return
    const controls = animate(0, 1, {
      duration: 1.8,
      delay: 0.25,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: setT,
    })
    return () => controls.stop()
  }, [inView, reduceMotion])

  if (reduceMotion) return null

  const value = 1 + (DIAL.value - 1) * t
  const [nx, ny] = needleEnd(value)
  // The white cover runs from the right end of the band to the left; shrinking it uncovers the
  // band from the left.
  const left = DIAL.cx - DIAL.r
  const right = DIAL.cx + DIAL.r

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden
      className="pointer-events-none absolute inset-0 size-full"
    >
      {/* Dial: cover the band, then the needle and the number. */}
      <path
        d={`M ${right} ${DIAL.cy} A ${DIAL.r} ${DIAL.r} 0 0 0 ${left} ${DIAL.cy}`}
        fill="none"
        stroke="#fff"
        strokeWidth={30}
        pathLength={1}
        strokeDasharray={`${1 - t} 2`}
      />
      <path
        d={`M ${DIAL.cx - 69} ${DIAL.cy + 4} A 69 69 0 0 1 ${DIAL.cx + 69} ${DIAL.cy + 4} Z`}
        fill="#fff"
      />
      <rect x={DIAL.cx - 12} y={DIAL.cy} width={24} height={12} fill="#fff" />
      <line
        x1={DIAL.cx}
        y1={DIAL.cy}
        x2={nx}
        y2={ny}
        stroke={DIAL.colour}
        strokeWidth={6}
        strokeLinecap="round"
      />
      <circle cx={DIAL.cx} cy={DIAL.cy + 1} r={7} fill={DIAL.colour} />
      <rect x={168} y={436} width={60} height={30} fill="#fff" />
      <text
        x={DIAL.cx + 1.5}
        y={460}
        textAnchor="middle"
        fill="#020617"
        fontSize={26.5}
        fontWeight={600}
        className="tabular-nums"
      >
        {Math.round(value)}
      </text>

      {/* Out-of-service bars: track, the rate growing, the national average mark. */}
      {BARS.map(({ y, rate, national }) => (
        <g key={y}>
          <rect
            x={BAR.x - 3}
            y={y - 6}
            width={BAR.width + 6}
            height={BAR.height + 12}
            fill="#fff"
          />
          <rect
            x={BAR.x}
            y={y}
            width={BAR.width}
            height={BAR.height}
            rx={BAR.height / 2}
            fill="#f2f5f7"
          />
          <rect
            x={BAR.x}
            y={y}
            width={Math.max((toX(rate) - BAR.x) * t, 0)}
            height={BAR.height}
            rx={BAR.height / 2}
            fill="#da2626"
          />
          <rect
            x={toX(national) - 1.5}
            y={y - 5}
            width={3}
            height={BAR.height + 10}
            fill="#0f172a"
          />
        </g>
      ))}
    </svg>
  )
}
