import { useQuery } from '@tanstack/react-query'
import type { Feature, Geometry } from 'geojson'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'

/*
 * The county shapes (us-atlas, Albers USA, the same frame as the state map), loaded only when a
 * state is opened: the file is about 260 KB, so the pages don't carry it until it's needed. Each
 * county's id is its 5-digit FIPS code: the state's two digits and the census's three (phy_cnty).
 */

export type CountyShape = Feature<Geometry, { name: string }> & { id: string }

async function loadCounties(): Promise<CountyShape[]> {
  const atlas = (await import('us-atlas/counties-albers-10m.json')).default as unknown as Topology<{
    counties: GeometryCollection<{ name: string }>
  }>
  return (
    feature(atlas, atlas.objects.counties) as unknown as { features: CountyShape[] }
  ).features.map((f) => ({ ...f, id: String(f.id) }))
}

/** Every county's shape, fetched once and kept. */
export function useCountyShapes() {
  return useQuery({
    queryKey: ['county-shapes'],
    queryFn: loadCounties,
    staleTime: Infinity,
    gcTime: Infinity,
  })
}

/** A state's counties, by the census's 3-digit code. */
export function countiesOf(shapes: CountyShape[] | undefined, stateFips: string) {
  return (shapes ?? []).filter((s) => s.id.startsWith(stateFips))
}

/** Independent cities, which the census lists like counties (code 500 and up in these states). */
const CITY_STATES = new Set(['VA', 'MD', 'MO', 'NV'])

/**
 * A county's name as people say it: "Harris County", "Orleans Parish", "Anchorage" (Alaska's
 * boroughs and areas have no common suffix), "Richmond (city)" for Virginia's independent cities.
 */
export function countyLabel(state: string, code: string, name: string | undefined): string {
  if (!name) return `County ${code}`
  if (state === 'DC') return name
  if (state === 'LA') return `${name} Parish`
  if (state === 'AK') return name
  if (CITY_STATES.has(state) && Number(code) >= 500) {
    return /city$/i.test(name) ? name : `${name} (city)`
  }
  return `${name} County`
}
