import { animate, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'

const format = new Intl.NumberFormat('en-US')

/** Counts up (or down) to `value`; jumps straight there for people who prefer reduced motion. */
export function AnimatedNumber({ value }: { value: number }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState(reduce ? value : 0)
  const from = useRef(reduce ? value : 0)

  useEffect(() => {
    if (reduce) {
      from.current = value
      setShown(value)
      return
    }
    const controls = animate(from.current, value, {
      duration: 1.4,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(Math.round(v)),
    })
    from.current = value
    return () => controls.stop()
  }, [value, reduce])

  return <span className="tabular-nums">{format.format(shown)}</span>
}
