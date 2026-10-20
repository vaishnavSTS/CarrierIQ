/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" shows the dashboard banner when no background worker is running (see SystemAlerts). */
  readonly VITE_SHOW_WORKER_ALERT?: string
}
