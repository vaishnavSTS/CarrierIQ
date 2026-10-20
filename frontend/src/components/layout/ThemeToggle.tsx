import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react'

import { useThemePreference, type ThemePreference } from '../../theme'

const OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light theme', icon: Sun },
  { value: 'dark', label: 'Dark theme', icon: Moon },
  { value: 'system', label: 'Match system theme', icon: Monitor },
]

/** Light / dark / system switch for the page header. */
export function ThemeToggle() {
  const [pref, setPref] = useThemePreference()

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className="flex items-center rounded-lg border border-slate-200 bg-surface p-0.5"
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const selected = pref === value
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => setPref(value)}
            className={`grid size-7 place-items-center rounded-md transition-colors ${
              selected
                ? 'bg-accent-soft text-accent-strong'
                : 'text-slate-400 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        )
      })}
    </div>
  )
}
