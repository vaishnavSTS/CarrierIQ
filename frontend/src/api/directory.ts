import { apiGet } from './client'

/** The public carrier map (backend routes/directory.py), with no login. */
export interface StateCount {
  state: string
  name: string
  carriers: number
  new_last_30_days: number
}

export interface PublicCarrier {
  usdot_number: number
  legal_name: string
  city: string | null
  power_units: number | null
  registered_on: string | null
  /** A USDOT under 5 years old reporting 1,000+ power units: worth a closer look. */
  fleet_needs_check: boolean
}

export type DirectorySort = 'newest' | 'largest' | 'az'
/** Active or inactive USDOT numbers */
export type DirectoryStatus = 'active' | 'inactive'

/** One page of a state's carriers; only the first 3 pages can be opened. */
export interface PublicStateList {
  state: string
  name: string
  status: DirectoryStatus
  sort: DirectorySort
  letter: string | null
  page: number
  carriers: PublicCarrier[]
  has_more: boolean
}

/** A carrier that just registered, anywhere in the country */
export interface RecentCarrier {
  usdot_number: number
  legal_name: string
  city: string | null
  state: string
  registered_on: string | null
}

export const getRecentCarriers = () => apiGet<RecentCarrier[]>('/public/directory/recent')

export const getPublicStateCounts = (status: DirectoryStatus) =>
  apiGet<StateCount[]>(`/public/directory/states?status=${status}`)

export const getPublicStateCarriers = (
  state: string,
  sort: DirectorySort,
  letter: string | null,
  page: number,
  status: DirectoryStatus,
) => {
  const params = new URLSearchParams({ sort, page: String(page), status })
  if (letter && sort === 'az') params.set('letter', letter)
  return apiGet<PublicStateList>(`/public/directory/states/${state}?${params}`)
}
