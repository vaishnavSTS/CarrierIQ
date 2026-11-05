import { apiGet } from './client'

/** One state on the carrier map (backend routes/directory.py). */
export interface StateCount {
  state: string
  name: string
  carriers: number
  new_last_30_days: number
}

export interface DirectoryCarrier {
  usdot_number: number
  legal_name: string
  dba_name: string | null
  city: string | null
  county_code: string | null
  power_units: number | null
  drivers: number | null
  registered_on: string | null
  /** A USDOT under 5 years old reporting 1,000+ power units: worth a closer look. */
  fleet_needs_check: boolean
}

export type DirectorySort = 'newest' | 'largest' | 'az'

export interface StatePage {
  state: string
  name: string
  sort: DirectorySort
  letter: string | null
  page: number
  carriers: DirectoryCarrier[]
  has_more: boolean
}

export const getStateCounts = () => apiGet<StateCount[]>('/directory/states')

export const getStateCarriers = (
  state: string,
  sort: DirectorySort,
  letter: string | null,
  page: number,
) => {
  const params = new URLSearchParams({ sort, page: String(page) })
  if (letter) params.set('letter', letter)
  return apiGet<StatePage>(`/directory/states/${state}?${params}`)
}
