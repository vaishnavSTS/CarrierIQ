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

/** One page of a state's carriers; only the first 3 pages can be opened. */
export interface PublicStateList {
  state: string
  name: string
  sort: DirectorySort
  letter: string | null
  page: number
  carriers: PublicCarrier[]
  has_more: boolean
}

export const getPublicStateCounts = () => apiGet<StateCount[]>('/public/directory/states')

export const getPublicStateCarriers = (
  state: string,
  sort: DirectorySort,
  letter: string | null,
  page: number,
) => {
  const params = new URLSearchParams({ sort, page: String(page) })
  if (letter && sort === 'az') params.set('letter', letter)
  return apiGet<PublicStateList>(`/public/directory/states/${state}?${params}`)
}
