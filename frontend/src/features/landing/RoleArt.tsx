import type { ReactNode } from 'react'

/**
 * The pictures on the DataQs cards. They are drawn rather than photos so their
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

/* The pictures on the DataQs cards. */

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
