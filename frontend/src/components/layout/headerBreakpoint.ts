/**
 * The screen width from which a portal header shows its links and the user menu in a row; below
 * it they move into the menu button. The staff header has more links, so it needs a wider screen.
 * The classes are written out in full so Tailwind finds them.
 */
export type HeaderBreakpoint = 'lg' | 'xl'

export const SHOW_FROM: Record<HeaderBreakpoint, string> = { lg: 'lg:flex', xl: 'xl:flex' }
export const HIDE_FROM: Record<HeaderBreakpoint, string> = { lg: 'lg:hidden', xl: 'xl:hidden' }
