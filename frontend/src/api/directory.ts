import { apiGet } from './client'

/** The carrier map (backend routes/directory.py): public, and in the carrier and agent portals. */
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
  /** The date of its Satisfactory safety rating, when it has one */
  rated_on?: string | null
}

/** 'new' (last 30 days) and 'rated' (Satisfactory rating) are in the portals' map only. */
export type DirectorySort = 'newest' | 'largest' | 'az' | 'new' | 'rated'
/** Active or inactive USDOT numbers */
export type DirectoryStatus = 'active' | 'inactive'

/** A state's carriers: the first 10 on the public pages, every one (25 a page) in the portals. */
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

/** The first 10 of a state's carriers; `has_more` says there are more after logging in. */
export const getPublicStateCarriers = (
  state: string,
  sort: DirectorySort,
  letter: string | null,
  status: DirectoryStatus,
) => {
  const params = new URLSearchParams({ sort, status })
  if (letter && sort === 'az') params.set('letter', letter)
  return apiGet<PublicStateList>(`/public/directory/states/${state}?${params}`)
}

/** Logged in (carrier and insurance agent portals): the same totals. */
export const getStateCounts = (status: DirectoryStatus) =>
  apiGet<StateCount[]>(`/directory/states?status=${status}`)

/** Logged in: every carrier in the state, 25 a page. */
export const getStateCarriers = (
  state: string,
  sort: DirectorySort,
  letter: string | null,
  page: number,
  status: DirectoryStatus,
) => {
  const params = new URLSearchParams({ sort, page: String(page), status })
  if (letter && sort === 'az') params.set('letter', letter)
  return apiGet<PublicStateList>(`/directory/states/${state}?${params}`)
}
