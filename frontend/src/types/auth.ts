export type UserRole = 'STS_ADMIN' | 'STS_ANALYST' | 'CLIENT_ADMIN' | 'CLIENT_USER'
export type Portal = 'internal' | 'client'
export type UserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED'

export interface User {
  id: number
  email: string
  full_name: string
  /** 10 digits; clients give one at sign-up, staff may have none */
  phone: string | null
  role: UserRole
  status: UserStatus
  /** Where this user lands after logging in */
  portal: Portal
  organization_id: number
  organization_name: string
  created_at: string
  last_login_at: string | null
}

export interface RegisterInput {
  full_name: string
  company_name: string
  email: string
  phone: string
  password: string
  usdot_number: number
}

export interface RegisterResult {
  status: 'PENDING'
  message: string
}

export interface PortalCarrier {
  usdot_number: number
  /** null until CarrierIQ has loaded the carrier */
  legal_name: string | null
  dba_name: string | null
  registration_status: string | null
  last_refreshed_at: string | null
}

export interface PortalOverview {
  organization_name: string
  carriers: PortalCarrier[]
}

/** An account as an STS admin sees it, with the USDOT numbers its company gave. */
export interface AdminUser extends User {
  usdot_numbers: number[]
  carrier_checks: CarrierContactCheck[]
}

/** Sign-up phone / email against FMCSA's record for a USDOT they gave. null = no answer yet. */
export interface CarrierContactCheck {
  usdot_number: number
  /** null until CarrierIQ has loaded the carrier */
  legal_name: string | null
  phone_matches_fmcsa: boolean | null
  email_matches_fmcsa: boolean | null
}
