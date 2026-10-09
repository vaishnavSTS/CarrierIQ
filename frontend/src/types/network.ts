/** Mirrors backend/app/schemas/network.py */

export type ShareKind = 'phone' | 'email' | 'address' | 'building' | 'officer'

export interface SharedDetail {
  kind: ShareKind
  value: string | null
  confidence: string
  first_seen: string
  last_seen: string
}

export interface LinkedCarrier {
  usdot_number: number
  legal_name: string | null
  /** ACTIVE | INACTIVE (census status) */
  status: string | null
  registered: string | null
  city: string | null
  state: string | null
  /** Strongest first */
  shares: SharedDetail[]
  signal_id: number | null
}

export type CheckStatus = 'ok' | 'attention' | 'alert' | 'info' | 'unknown'

export interface RegistrationCheck {
  key: string
  label: string
  status: CheckStatus
  detail: string
  source: string
  as_of: string | null
}

export type IdentityEventType =
  | 'OWNERSHIP_CHANGE_ATTESTED'
  | 'ATTESTATION_CORRECTED'
  | 'PLATFORM_ALERT'
  | 'OWNERSHIP_VERIFIED'
  | 'NOTE'

export interface IdentityEvent {
  id: number
  event_type: IdentityEventType
  event_date: string
  platform: string | null
  description: string | null
  supporting_document: string | null
  corrects_event_id: number | null
  corrected_by: number[]
  source: string
  entered_by: string | null
  created_at: string
}

export interface CarrierNetwork {
  usdot_number: number
  /** Strongest links first */
  linked_carriers: LinkedCarrier[]
  links_checked_at: string | null
  registration_checks: RegistrationCheck[]
  ownership: {
    state: 'NONE' | 'ATTESTED' | 'CONFLICTING' | 'VERIFIED'
    summary: string
    action: string | null
  }
  /** Oldest first */
  identity_events: IdentityEvent[]
}

export interface IdentityEventInput {
  event_type: IdentityEventType
  event_date: string
  platform: string | null
  description: string
  supporting_document: string | null
  corrects_event_id: number | null
  entered_by: string | null
}
