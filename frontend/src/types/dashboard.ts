/** Mirrors backend/app/schemas/dashboard.py */

export interface DashboardTotals {
  carriers: number
  inspections: number
  /** Distinct VINs */
  vehicles: number
  /** Active, OPEN, above INFO */
  open_signals: number
  open_by_severity: { HIGH: number; MEDIUM: number; LOW: number }
}

export interface RecentSignal {
  id: number
  usdot_number: number
  legal_name: string
  signal_type: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH'
  title: string
  detected_at: string | null
}

export interface Dashboard {
  totals: DashboardTotals
  /** Newest first */
  recent_signals: RecentSignal[]
}
