export type UserRole =
  | 'STS_ADMIN'
  | 'STS_ANALYST'
  | 'CLIENT_ADMIN'
  | 'CLIENT_USER'
  | 'BROKER_ADMIN'
  | 'BROKER_USER'
export type Portal = 'internal' | 'client' | 'broker'
export type UserStatus = 'PENDING' | 'ACTIVE' | 'DISABLED'

/** The $25/month subscription; null on User for logins that never pay (staff, older accounts). */
export interface Billing {
  state: 'trial' | 'active' | 'locked'
  trial_ends_at: string
  /** While on the free trial */
  trial_days_left: number | null
  /** Dollars, e.g. "25" */
  monthly_price: string
  /** Stripe's: active, past_due, canceled, ... */
  subscription_status: string | null
  /** Paid up to; Stripe charges again then */
  current_period_end: string | null
  /** Stripe's billing page can open (change card, cancel) */
  can_manage: boolean
}

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
  billing?: Billing | null
  /** False right after a password sign-up, until the emailed link is clicked */
  email_verified?: boolean
}

export interface RegisterInput {
  full_name: string
  company_name: string
  email: string
  phone: string
  password: string
  usdot_number: number
}

export interface PortalCarrier {
  usdot_number: number
  /** null until CarrierSafetyScan has loaded the carrier */
  legal_name: string | null
  dba_name: string | null
  registration_status: string | null
  last_refreshed_at: string | null
  /** STS has verified the carrier is the client's; DataQs requests need it */
  verified: boolean
}

export interface PortalOverview {
  organization_name: string
  carriers: PortalCarrier[]
}

/** An account as an STS admin sees it, with the USDOT numbers its company gave. */
export interface AdminUser extends User {
  usdot_numbers: number[]
  /** The ones STS has verified as the company's: only these can be used for DataQs */
  verified_usdot_numbers: number[]
  /** A client sign-up STS hasn't seen yet (shown in the Accounts pop-up) */
  is_new: boolean
  carrier_checks: CarrierContactCheck[]
  /** Broker accounts: the brokerage FMCSA confirmed at sign-up */
  broker: Brokerage | null
}

/** Sign-up phone / email against FMCSA's record for a USDOT they gave. null = no answer yet. */
export interface CarrierContactCheck {
  usdot_number: number
  /** null until CarrierSafetyScan has loaded the carrier */
  legal_name: string | null
  phone_matches_fmcsa: boolean | null
  email_matches_fmcsa: boolean | null
  /** Company name given vs FMCSA legal / DBA name, ignoring case, punctuation, LLC / Inc */
  company_matches_fmcsa: boolean | null
}

export interface AuthOptions {
  /** Show "Continue with Google" */
  google: boolean
  /** Clients may search and open any carrier (temporary, for team testing) */
  client_search: boolean
  /** Show the Cloudflare Turnstile check on login and sign-up; null while it is off */
  turnstile_site_key: string | null
}

export interface GoogleSignupPending {
  email: string
  full_name: string
  /** Which sign-up the Google round trip started from */
  portal: 'client' | 'broker'
}

/** A brokerage is identified by its MC number or, failing that, its USDOT number. */
export type BrokerIdKind = 'MC' | 'USDOT'

export interface BrokerRegisterInput {
  full_name: string
  company_name: string
  email: string
  phone: string
  password: string
  id_kind: BrokerIdKind
  id_number: number
}

export interface BrokerGoogleSignupInput {
  company_name: string
  phone: string
  id_kind: BrokerIdKind
  id_number: number
}

/** A brokerage's FMCSA identity, as checked at sign-up. */
export interface Brokerage {
  organization_name: string
  usdot_number: number | null
  /** e.g. "MC261603" */
  docket_number: string | null
  /** MOTUS | LEGACY_LI */
  authority_source: string | null
  authority_checked_at: string | null
}

export interface GoogleSignupInput {
  phone: string
  usdot_number: number
  /** Compared with FMCSA's legal / DBA name on the Accounts page */
  company_name: string
}
