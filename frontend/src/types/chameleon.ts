/** Chameleon check (GET /carriers/{usdot}/chameleon, and the broker equivalent). */

export interface ChameleonShare {
  /** ein | phone | email | address | building | officer | duns | mailing_address */
  kind: string
  value: string | null
  /** A value this carrier used before, not its current one */
  past: boolean
}

export interface ChameleonLinked {
  usdot_number: number
  legal_name: string | null
  /** ACTIVE | INACTIVE (census status) */
  status: string | null
  registered: string | null
  /** Strongest first */
  shares: ChameleonShare[]
  /** Distinct kinds of detail shared (another unit in the same building does not count) */
  distinct_kinds: number
  shared_vins: number
  revocations: string[]
  oos_orders: string[]
  active_oos_order: boolean
  shutdown_date: string | null
  /** Days from the shutdown to this carrier's USDOT add date; positive: added afterwards */
  days_after_shutdown: number | null
  first_linked: string | null
}

export interface ChameleonCheck {
  usdot_number: number
  registered: string | null
  prior_revoke: { flagged: boolean; usdot_number: number | null }
  fleet_overlap: {
    window_months: number
    power_units_seen: number
    shared_power_units: number
    percent: number | null
    threshold_percent: number
    over_threshold: boolean
  }
  /** Strongest first */
  linked: ChameleonLinked[]
  summary: {
    linked_carriers: number
    shut_down: number
    sharing_two_or_more: number
    added_within_year_after_shutdown: number
  }
  /** Whether FMCSA QCMobile gave this carrier's EIN to compare (the number is never sent) */
  ein_known?: boolean
  /** Linked carriers whose EIN was known and compared */
  eins_compared?: number
  links_checked_at: string | null
  orders_checked: boolean
  truncated: boolean
  note: string | null
}
