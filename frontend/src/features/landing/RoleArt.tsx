/**
 * The pictures on the homepage's "Who it's for" cards. They are drawn rather than photos so their
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
