import { apiGet } from './client'

/** The carrier map (backend routes/directory.py): public, and in the carrier and agent portals. */
export interface StateCount {
  state: string
  name: string
  carriers: number
  new_last_30_days: number
}

/** A state's carriers in one county (the census's 3-digit county code, FIPS) */
export interface CountyCount {
  county: string
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
  /** The county the list is narrowed to, if any */
  county?: string | null
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

/** A state's carriers per county, most first. */
export const getPublicCountyCounts = (state: string, status: DirectoryStatus) =>
  apiGet<CountyCount[]>(`/public/directory/states/${state}/counties?status=${status}`)

/** The first 10 of a state's (or a county's) carriers; `has_more`: more after logging in. */
export const getPublicStateCarriers = (
  state: string,
  sort: DirectorySort,
  letter: string | null,
  status: DirectoryStatus,
  county: string | null = null,
) => {
  const params = new URLSearchParams({ sort, status })
  if (letter && sort === 'az') params.set('letter', letter)
  if (county) params.set('county', county)
  return apiGet<PublicStateList>(`/public/directory/states/${state}?${params}`)
}

/** Logged in (carrier and insurance agent portals): the same totals. */
export const getStateCounts = (status: DirectoryStatus) =>
  apiGet<StateCount[]>(`/directory/states?status=${status}`)

/** Logged in: a state's carriers per county. */
export const getCountyCounts = (state: string, status: DirectoryStatus) =>
  apiGet<CountyCount[]>(`/directory/states/${state}/counties?status=${status}`)

/** Logged in: every carrier in the state (or one of its counties), 25 a page. */
export const getStateCarriers = (
  state: string,
  sort: DirectorySort,
  letter: string | null,
  page: number,
  status: DirectoryStatus,
  county: string | null = null,
) => {
  const params = new URLSearchParams({ sort, page: String(page), status })
  if (letter && sort === 'az') params.set('letter', letter)
  if (county) params.set('county', county)
  return apiGet<PublicStateList>(`/directory/states/${state}?${params}`)
}
