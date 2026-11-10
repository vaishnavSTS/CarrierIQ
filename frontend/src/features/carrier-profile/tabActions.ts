import { createContext } from 'react'

/**
 * The right end of the carrier page's tab bar. A tab puts its own actions there (the Safety
 * Score Report's PDF button) through a portal; null outside the carrier page.
 */
export const TabActions = createContext<HTMLElement | null>(null)
