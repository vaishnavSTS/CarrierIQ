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

export interface CarrierAuthority {
  usdot_number: number
  dockets: DocketDetail[]
  current_insurance: InsuranceFiling[]
  insurance_history: InsuranceFiling[]
  authority_history: AuthorityAction[]
}
