/** Mirrors backend/app/schemas/carrier_search.py */

export type SearchKind = 'usdot' | 'docket' | 'name'

export interface Docket {
  prefix: string
  number: string
  status: string | null
}

export interface CarrierSearchResult {
  usdot_number: number
  legal_name: string
  dba_name: string | null
  dockets: Docket[]
  authority_status: string | null
  registration_status: string | null
  insurance_status: string | null
  review_status: string | null
  fleet_size: number | null
  city: string | null
  state: string | null
  last_refreshed_at: string | null
  /** false: found only in the live source; opening the carrier loads it */
  loaded: boolean
  /** true: a refresh was due but the source failed, so stored data is shown */
  stale: boolean
}

export interface CarrierSearchResponse {
  query: string
  query_type: SearchKind
  results: CarrierSearchResult[]
}
