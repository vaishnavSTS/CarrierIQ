import type { UserRole } from '../../types/auth'

/** How each role is named in the header and menu. */
export const ROLE_LABELS: Record<UserRole, string> = {
  STS_ADMIN: 'STS admin',
  STS_ANALYST: 'STS analyst',
  CLIENT_ADMIN: 'Account owner',
  CLIENT_USER: 'Viewer',
  BROKER_ADMIN: 'Broker owner',
  BROKER_USER: 'Broker',
}
