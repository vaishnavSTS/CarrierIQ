/** Mirrors backend/app/schemas/carrier_authority.py */

export interface DocketDetail {
  prefix: string
  number: string
  authority_type: string | null
  status: string | null
  /** MOTUS (current) | LEGACY_LI (frozen 2026-05-14) | CENSUS (docket status only) */
  status_source: string | null
  status_as_of: string | null
  bipd_required: string | null // decimal dollars, as a string
  bipd_on_file: string | null
  cargo_required: boolean | null
  cargo_on_file: boolean | null
  bond_required: boolean | null
  bond_on_file: boolean | null
  revocation_pending: boolean | null
}

export interface InsuranceFiling {
  docket: string | null
  insurance_type: string | null // BIPD | CARGO | BOND | TRUST_FUND
  insurance_class: string | null
  insurer: string | null
  policy_number: string | null
  coverage_amount: string | null
  underlying_limit: string | null
  effective_date: string | null
  termination_date: string | null
  status: string | null
  source_system: string | null
  status_as_of: string | null
}

export interface AuthorityAction {
  docket: string
  action_date: string | null
  action: string
  status: string | null
  authority_type: string | null
  source_system: string
}

/** Usual renewal date, estimated from yearly filing start dates (FMCSA has no due date) */
export interface Renewal {
  docket: string
  insurance_type: string
  current_effective: string
  since: string
  filings: number
  expected: string
  data_as_of: string | null
  /** pattern | upcoming (within 30 days) | unconfirmed (after the data stopped) | passed */
  state: 'pattern' | 'upcoming' | 'unconfirmed' | 'passed'
  summary: string
}

/** A BOC-3 process agent; FMCSA's BOC-3 data has no filing dates */
export interface ProcessAgent {
  docket: string | null
  name: string
  attention: string | null
  city: string | null
  state: string | null
  source_system: string // MOTUS | LEGACY_LI
}

export interface CarrierAuthority {
  usdot_number: number
  dockets: DocketDetail[]
  current_insurance: InsuranceFiling[]
  insurance_history: InsuranceFiling[]
  authority_history: AuthorityAction[]
  renewals: Renewal[]
  /** null when BOC-3 data has not been fetched yet */
  process_agents: ProcessAgent[] | null
}
