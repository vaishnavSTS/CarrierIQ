import { useEffect, useRef } from 'react'

/**
 * Decorative page lighting behind all content: two violet spotlight beams that sweep in on
 * load and sway slowly, plus a soft glow that follows the mouse. Purely visual; it never
 * captures clicks, and the beams hold still for people who prefer reduced motion.
 */
export function BackgroundSpotlight() {
  const glow = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let frame = 0
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        glow.current?.style.setProperty('--x', `${event.clientX}px`)
        glow.current?.style.setProperty('--y', `${event.clientY}px`)
        glow.current?.style.setProperty('opacity', '1')
      })
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => {
      window.removeEventListener('pointermove', move)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="spotlight-beam absolute left-0 top-0 h-[150vh] w-[70vw] min-w-[40rem]"
        style={{
          background:
            'radial-gradient(68% 50% at 50% 50%, rgba(167,139,250,0.20) 0%, rgba(139,92,246,0.06) 55%, transparent 80%)',
        }}
      />
      <div
        className="spotlight-beam second absolute left-[85%] top-0 h-[120vh] w-[45vw] min-w-[28rem]"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 50%, rgba(232,121,249,0.12) 0%, rgba(192,132,252,0.04) 55%, transparent 80%)',
        }}
      />
      <div
        ref={glow}
        className="absolute inset-0 opacity-0 transition-opacity duration-700"
        style={{
          background:
            'radial-gradient(600px circle at var(--x, 50%) var(--y, 30%), rgba(139,92,246,0.10), transparent 45%)',
        }}
      />
    </div>
  )
}
