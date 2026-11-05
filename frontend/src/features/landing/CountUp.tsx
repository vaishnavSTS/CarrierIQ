import { animate, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

const format = new Intl.NumberFormat('en-US')

/** A number that counts up from 0 the first time it is on screen. */
export function CountUp({ value, prefix = '' }: { value: number | null; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const reduceMotion = useReducedMotion()
  const [shown, setShown] = useState(0)

  useEffect(() => {
    if (value == null || !inView) return
    if (reduceMotion) {
      setShown(value)
      return
    }
    const controls = animate(0, value, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(Math.round(v)),
    })
    return () => controls.stop()
  }, [value, inView, reduceMotion])

  return (
    <span ref={ref} className="tabular-nums">
      {value == null ? '…' : `${prefix}${format.format(shown)}`}
    </span>
  )
}
