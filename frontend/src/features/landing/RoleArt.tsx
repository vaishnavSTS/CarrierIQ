import type { ReactNode } from 'react'

/**
 * The pictures on the homepage's cards. They are drawn rather than photos so their
 * colors come from the theme (.role-art in index.css): deep blue and violet in the light theme,
 * black, blue and orange in the dark one.
 */

const SKY = 'url(#role-sky)'

function Backdrop() {
  return (
    <>
      <defs>
        <linearGradient id="role-sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--art-sky-from)" />
          <stop offset="1" stopColor="var(--art-sky-to)" />
        </linearGradient>
      </defs>
      <rect width="400" height="180" fill={SKY} />
      <circle cx="340" cy="28" r="70" fill="var(--art-glow)" opacity="0.28" />
      <circle cx="340" cy="28" r="34" fill="var(--art-glow)" opacity="0.4" />
    </>
  )
}

function Truck({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {/* Trailer */}
      <rect x="0" y="0" width="150" height="66" rx="5" fill="var(--art-light)" />
      <rect x="0" y="50" width="150" height="6" fill="var(--art-glow)" />
      <path d="M16 14h74M16 26h50" stroke="var(--art-mid)" strokeWidth="5" strokeLinecap="round" />
      {/* Cab */}
      <path d="M156 18h26c4 0 7 2 9 5l13 20c1 2 2 4 2 6v21h-50V18Z" fill="var(--art-glow)" />
      <path d="M168 26h12c2 0 3 1 4 2l9 15h-25V26Z" fill="var(--art-sky-from)" />
      <rect x="150" y="56" width="8" height="14" fill="var(--art-mid)" />
      <rect x="0" y="66" width="206" height="6" rx="2" fill="var(--art-mid)" />
      {/* Wheels */}
      {[28, 54, 136, 182].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="76" r="12" fill="var(--art-dark)" />
          <circle cx={cx} cy="76" r="5" fill="var(--art-light)" />
        </g>
      ))}
    </g>
  )
}

function Road() {
  return (
    <>
      <path d="M0 118 80 92l70 18 90-30 80 24 80-20v96H0Z" fill="var(--art-mid)" opacity="0.5" />
      <rect y="142" width="400" height="38" fill="var(--art-dark)" />
      <path
        d="M14 161h36M84 161h36M154 161h36M224 161h36M294 161h36M364 161h36"
        stroke="var(--art-light)"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.8"
      />
    </>
  )
}

export function CarrierArt() {
  return (
    <svg
      viewBox="0 0 400 180"
      preserveAspectRatio="xMidYMid slice"
      className="role-art"
      aria-hidden
    >
      <Backdrop />
      <Road />
      <Truck x={84} y={66} />
    </svg>
  )
}

export function BrokerArt() {
  return (
    <svg
      viewBox="0 0 400 180"
      preserveAspectRatio="xMidYMid slice"
      className="role-art"
      aria-hidden
    >
      <Backdrop />
      {/* Map grid */}
      <path
        d="M0 45h400M0 90h400M0 135h400M60 0v180M120 0v180M180 0v180M240 0v180M300 0v180M360 0v180"
        stroke="var(--art-light)"
        strokeWidth="1"
        opacity="0.12"
      />
      {/* The route between two places */}
      <path
        d="M42 138c30-62 60-20 92-48s36-20 58-26"
        fill="none"
        stroke="var(--art-glow)"
        strokeWidth="4"
        strokeDasharray="3 10"
        strokeLinecap="round"
      />
      {[
        [42, 138],
        [192, 64],
      ].map(([x, y]) => (
        <g key={x} transform={`translate(${x} ${y})`}>
          <path
            d="M0 0c-9-12-15-19-15-27a15 15 0 0 1 30 0c0 8-6 15-15 27Z"
            fill="var(--art-light)"
          />
          <circle cy="-27" r="6" fill="var(--art-mid)" />
        </g>
      ))}
      {/* The load board: carriers being checked */}
      <rect x="218" y="42" width="156" height="112" rx="10" fill="var(--art-light)" />
      <rect x="218" y="42" width="156" height="24" rx="10" fill="var(--art-mid)" />
      {[80, 104, 128].map((y, i) => (
        <g key={y}>
          <rect
            x="232"
            y={y}
            width={[78, 62, 70][i]}
            height="9"
            rx="4.5"
            fill="var(--art-mid)"
            opacity="0.55"
          />
          <circle
            cx="352"
            cy={y + 4.5}
            r="9"
            fill={i === 1 ? 'var(--art-glow)' : 'var(--art-mid)'}
          />
          {i === 1 ? (
            <path
              d="M352 112v5M352 121v.5"
              stroke="var(--art-dark)"
              strokeWidth="3"
              strokeLinecap="round"
              transform={`translate(0 ${y - 111})`}
            />
          ) : (
            <path
              d={`M348 ${y + 4.5}l3 3 5-6`}
              fill="none"
              stroke="var(--art-light)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </g>
      ))}
    </svg>
  )
}

export function AgentArt() {
  return (
    <svg
      viewBox="0 0 400 180"
      preserveAspectRatio="xMidYMid slice"
      className="role-art"
      aria-hidden
    >
      <Backdrop />
      <Road />
      <Truck x={22} y={92} scale={0.62} />
      {/* The policy */}
      <g transform="rotate(-7 260 90)">
        <rect x="196" y="32" width="112" height="126" rx="9" fill="var(--art-light)" />
        <path
          d="M212 52h64M212 68h80M212 84h46M212 124h80M212 140h52"
          stroke="var(--art-mid)"
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.55"
        />
      </g>
      {/* The shield */}
      <path
        d="M318 44l44 16v36c0 30-19 50-44 60-25-10-44-30-44-60V60l44-16Z"
        fill="var(--art-glow)"
        stroke="var(--art-dark)"
        strokeWidth="4"
      />
      <path
        d="M298 98l15 15 27-31"
        fill="none"
        stroke="var(--art-dark)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/* The pictures on the "What you get" and DataQs cards, in the same style. */

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 400 180"
      preserveAspectRatio="xMidYMid slice"
      className="role-art"
      aria-hidden
    >
      <Backdrop />
      {children}
    </svg>
  )
}

/** A sheet with rows, each ending in a check mark, or a warning on the rows listed. */
function Sheet({ x, y, rows, warn = [] }: { x: number; y: number; rows: number; warn?: number[] }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="150" height={rows * 26 + 30} rx="10" fill="var(--art-light)" />
      <rect width="150" height="20" rx="10" fill="var(--art-mid)" />
      {Array.from({ length: rows }, (_, i) => {
        const cy = 40 + i * 26
        const flagged = warn.includes(i)
        return (
          <g key={i}>
            <rect
              x="14"
              y={cy - 4}
              width={[86, 70, 80, 62][i % 4]}
              height="8"
              rx="4"
              fill="var(--art-mid)"
              opacity="0.5"
            />
            <circle cx="130" cy={cy} r="8" fill={flagged ? 'var(--art-glow)' : 'var(--art-mid)'} />
            {flagged ? (
              <path
                d={`M130 ${cy - 4}v4.5M130 ${cy + 3.5}v.5`}
                stroke="var(--art-dark)"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            ) : (
              <path
                d={`M126.5 ${cy}l2.5 2.5 4.5-5`}
                fill="none"
                stroke="var(--art-light)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </g>
        )
      })}
    </g>
  )
}

function Magnifier({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M22 22l26 26" stroke="var(--art-dark)" strokeWidth="13" strokeLinecap="round" />
      <path d="M22 22l26 26" stroke="var(--art-glow)" strokeWidth="8" strokeLinecap="round" />
      <circle
        r="30"
        fill="var(--art-light)"
        fillOpacity="0.35"
        stroke="var(--art-glow)"
        strokeWidth="7"
      />
    </g>
  )
}

function Plane({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale}) rotate(-14)`}>
      <path d="M0 18 56 0 34 44 26 26Z" fill="var(--art-glow)" />
      <path
        d="M0 18l26 8 30-26"
        fill="none"
        stroke="var(--art-dark)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </g>
  )
}

const DOTTED = {
  fill: 'none',
  stroke: 'var(--art-light)',
  strokeWidth: 3,
  strokeDasharray: '2 9',
  strokeLinecap: 'round' as const,
  opacity: 0.8,
}

export function BrokerCheckArt() {
  return (
    <Frame>
      <Sheet x={110} y={30} rows={4} warn={[2]} />
      <Magnifier x={262} y={92} />
    </Frame>
  )
}

export function FixArt() {
  const bars = [104, 78, 56, 36, 22]
  return (
    <Frame>
      <path d="M86 150h228" stroke="var(--art-light)" strokeWidth="3" strokeLinecap="round" />
      {bars.map((h, i) => (
        <rect
          key={h}
          x={98 + i * 44}
          y={146 - h}
          width="30"
          height={h}
          rx="5"
          fill={i === 0 ? 'var(--art-glow)' : 'var(--art-light)'}
          opacity={i === 0 ? 1 : 0.9 - i * 0.1}
        />
      ))}
      <path d="M112 30c50 6 110 40 170 84" {...DOTTED} stroke="var(--art-glow)" strokeWidth={4} />
      <path
        d="M268 100l18 18-24 4"
        fill="none"
        stroke="var(--art-glow)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  )
}

export function RegistrationArt() {
  return (
    <Frame>
      <g transform="rotate(-5 175 95)">
        <rect x="112" y="28" width="126" height="132" rx="9" fill="var(--art-light)" />
        <path
          d="M128 50h70M128 68h92M128 86h56M128 104h84M128 122h64M128 140h40"
          stroke="var(--art-mid)"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.5"
        />
      </g>
      {/* Overdue: a calendar with a warning */}
      <g transform="translate(232 62)">
        <rect width="80" height="74" rx="10" fill="var(--art-mid)" />
        <rect width="80" height="22" rx="10" fill="var(--art-dark)" />
        <path
          d="M18-6v14M62-6v14"
          stroke="var(--art-light)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M40 30l22 36H18Z"
          fill="var(--art-glow)"
          stroke="var(--art-dark)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          d="M40 42v11M40 59v.5"
          stroke="var(--art-dark)"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
    </Frame>
  )
}

export function PacketArt() {
  return (
    <Frame>
      {[-10, -4].map((r, i) => (
        <rect
          key={r}
          x="104"
          y="34"
          width="122"
          height="130"
          rx="9"
          fill="var(--art-light)"
          opacity={0.45 + i * 0.25}
          transform={`rotate(${r} 165 100)`}
        />
      ))}
      <rect x="110" y="30" width="122" height="130" rx="9" fill="var(--art-light)" />
      <path
        d="M140 92a31 31 0 0 1 62 0"
        fill="none"
        stroke="var(--art-mid)"
        strokeWidth="10"
        opacity="0.45"
      />
      <path d="M140 92a31 31 0 0 1 40-29.6" fill="none" stroke="var(--art-glow)" strokeWidth="10" />
      <path
        d="M126 116h90M126 132h66M126 146h80"
        stroke="var(--art-mid)"
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path d="M238 104c26-4 44-24 58-48" {...DOTTED} />
      <Plane x={284} y={42} />
    </Frame>
  )
}

export function FindArt() {
  return (
    <Frame>
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(96 ${26 + i * 34})`}>
          <rect
            width="208"
            height="26"
            rx="8"
            fill={i === 1 ? 'var(--art-glow)' : 'var(--art-light)'}
            opacity={i === 1 ? 1 : 0.85}
          />
          <circle cx="16" cy="13" r="5" fill={i === 1 ? 'var(--art-dark)' : 'var(--art-mid)'} />
          <rect
            x="30"
            y="9"
            width={[110, 128, 96, 118][i]}
            height="8"
            rx="4"
            fill={i === 1 ? 'var(--art-dark)' : 'var(--art-mid)'}
            opacity="0.55"
          />
        </g>
      ))}
      <Magnifier x={286} y={62} />
    </Frame>
  )
}

export function FileArt() {
  return (
    <Frame>
      <Sheet x={46} y={40} rows={3} />
      <path d="M206 108c40-50 80-50 110-14" {...DOTTED} />
      <Plane x={232} y={52} scale={0.8} />
      {/* The agency that reviews it */}
      <g transform="translate(290 70)">
        <path d="M0 26 40 0l40 26Z" fill="var(--art-light)" />
        <rect y="26" width="80" height="8" fill="var(--art-light)" />
        {[8, 26, 44, 62].map((cx) => (
          <rect
            key={cx}
            x={cx}
            y="38"
            width="10"
            height="38"
            rx="2"
            fill="var(--art-light)"
            opacity="0.9"
          />
        ))}
        <rect y="78" width="80" height="10" rx="2" fill="var(--art-light)" />
      </g>
    </Frame>
  )
}

export function FollowArt() {
  const steps = [90, 200, 310]
  return (
    <Frame>
      <path
        d="M90 112h220"
        stroke="var(--art-light)"
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.35"
      />
      <path d="M90 112h110" stroke="var(--art-light)" strokeWidth="6" strokeLinecap="round" />
      {steps.map((cx, i) => (
        <g key={cx}>
          <circle
            cx={cx}
            cy="112"
            r="20"
            fill={i < 2 ? 'var(--art-light)' : 'var(--art-sky-from)'}
            stroke={i < 2 ? 'none' : 'var(--art-glow)'}
            strokeWidth="5"
          />
          {i < 2 ? (
            <path
              d={`M${cx - 8} 112l6 6 11-12`}
              fill="none"
              stroke="var(--art-mid)"
              strokeWidth="4.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <circle cx={cx} cy="112" r="6" fill="var(--art-glow)" />
          )}
        </g>
      ))}
      {/* The review: a balance */}
      <g
        transform="translate(200 30)"
        stroke="var(--art-light)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      >
        <path d="M0 0v40M-30 8h60M-30 8l-10 20M-30 8l10 20M30 8l-10 20M30 8l10 20" />
        <path d="M-42 28a12 7 0 0 0 24 0ZM18 28a12 7 0 0 0 24 0Z" fill="var(--art-light)" />
      </g>
    </Frame>
  )
}
