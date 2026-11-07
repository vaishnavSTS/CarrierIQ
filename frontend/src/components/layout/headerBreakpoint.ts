/**
 * The screen width from which a portal header shows its links and the user menu in a row; below
 * it they move into the menu button. The staff header has the most links, so it needs the widest screen.
 * The classes are written out in full so Tailwind finds them.
 */
export type HeaderBreakpoint = 'lg' | 'xl' | '2xl'

export const SHOW_FROM: Record<HeaderBreakpoint, string> = {
  lg: 'lg:flex',
  xl: 'xl:flex',
  '2xl': '2xl:flex',
}
export const HIDE_FROM: Record<HeaderBreakpoint, string> = {
  lg: 'lg:hidden',
  xl: 'xl:hidden',
  '2xl': '2xl:hidden',
}
