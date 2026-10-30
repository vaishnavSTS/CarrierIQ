"""Application settings, loaded only from environment variables (or a local .env file)."""

from datetime import date
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Default session key for local development only; create_app refuses it anywhere else.
DEV_AUTH_SECRET_KEY = "local-development-only-key-never-use-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "CarrierSafetyScan API"
    environment: str = "local"
    log_level: str = "INFO"

    database_url: str = "postgresql+psycopg://carrieriq:carrieriq@localhost:5432/carrieriq"

    # Comma-separated list of allowed frontend origins.
    cors_origins: str = "http://localhost:5173"

    # data.transportation.gov (Socrata). The app token is optional; it raises rate limits.
    socrata_base_url: str = "https://data.transportation.gov"
    socrata_app_token: str | None = None
    socrata_timeout_seconds: float = 30.0
    socrata_page_size: int = 1000
    socrata_max_attempts: int = 4  # retries on network errors, HTTP 429 and 5xx
    socrata_retry_base_seconds: float = 1.0  # backoff: 1s, 2s, 4s, ...

    # On-demand refresh (spec Section 19.2): a carrier older than this is re-fetched on search.
    carrier_refresh_hours: float = 24.0
    # Intelligence signals (spec Section 12): changes older than this are history, not signals.
    signal_lookback_days: int = 730
    # Carriers sharing a phone, email, address or officer; more matches than this are cut off.
    contact_link_limit: int = 200
    # Background worker (spec Section 18): a PostgreSQL-backed job queue, no Redis.
    # Local development: also run the worker inside the API process (app/main.py), so starting
    # the backend starts both. Leave off when hosted, where the worker is its own service.
    run_worker_in_api: bool = False
    worker_poll_seconds: float = 5.0  # wait between checks when the queue is empty
    worker_heartbeat_seconds: float = 30.0  # how often a running worker checks in
    job_max_attempts: int = 4
    job_retry_base_seconds: float = 60.0  # retry n waits base * 2^(n-1): 1, 2, 4 minutes
    job_lock_timeout_minutes: int = 30  # a RUNNING job older than this belonged to a dead worker
    # Scheduled ingestion: the worker queues refreshes of carriers older than carrier_refresh_hours.
    scheduler_enabled: bool = True
    schedule_interval_minutes: float = 15.0
    schedule_batch_size: int = 50  # carriers queued per round, oldest data first
    schedule_failed_cooldown_hours: float = 6.0  # wait after a refresh that gave up
    search_result_limit: int = 20  # name search results
    docket_search_limit: int = 10  # carriers loaded for one docket search

    # NHTSA vPIC VIN decoding (spec Section 19.1): batch endpoint, up to 50 VINs per call.
    vpic_base_url: str = "https://vpic.nhtsa.dot.gov/api/vehicles"
    vpic_batch_size: int = 50
    vpic_parallel_requests: int = 4
    vpic_timeout_seconds: float = 60.0

    # FMCSA QCMobile API: one carrier's snapshot, including its EIN. Needs a free WebKey from
    # FMCSA (a secret: set QCMOBILE_WEB_KEY in the environment, never in code). Off when unset.
    qcmobile_base_url: str = "https://mobile.fmcsa.dot.gov/qc/services"
    qcmobile_web_key: str | None = None
    qcmobile_timeout_seconds: float = 20.0
    qcmobile_parallel_requests: int = 4

    # data.transportation.gov dataset IDs (spec Section 19.1: IDs live in configuration).
    census_dataset_id: str = "az4n-8mr2"  # Company Census File
    inspection_dataset_id: str = "fx4q-ay7w"  # Vehicle Inspection File
    inspection_unit_dataset_id: str = "wt8s-2hbx"  # Inspections Per Unit (VINs)
    violation_dataset_id: str = "876r-jsdb"  # Vehicle Inspections and Violations
    # Operating authority: Motus (current, daily) and legacy L&I (frozen on its last refresh).
    motus_carrier_dataset_id: str = "inys-ebih"  # Motus Carrier - All With History
    motus_authhist_dataset_id: str = "yu5v-wbh6"  # Motus AuthHist - All With History
    legacy_carrier_dataset_id: str = "6eyk-hxee"  # Carrier - All With History (legacy L&I)
    legacy_authhist_dataset_id: str = "9mw4-x3tu"  # AuthHist - All With History (legacy L&I)
    motus_insurance_dataset_id: str = "c5y8-a4uz"  # Motus Insur - All With History
    motus_insurance_history_dataset_id: str = "3uet-3z4i"  # Motus InsHist - All With History
    legacy_insurance_dataset_id: str = "ypjt-5ydn"  # Insur - All With History (legacy L&I)
    legacy_insurance_history_dataset_id: str = "6sqe-dvqs"  # InsHist - All With History (legacy)
    oos_orders_dataset_id: str = "p2mt-9ige"  # Out of Service Orders (FMCSA)
    motus_revoke_suspend_dataset_id: str = "wb4f-neki"  # Motus RevokeSuspend - All With History
    motus_boc3_dataset_id: str = "6snj-ed7q"  # Motus BOC3 - All With History
    legacy_boc3_dataset_id: str = "2emp-mxtb"  # BOC3 - All With History (legacy L&I)
    # FMCSA SMS (CSA) monthly results, one row per carrier: passenger files carry percentiles
    sms_ab_pass_dataset_id: str = "m3ry-qcip"  # SMS AB Pass (interstate / hazmat, passenger)
    sms_c_pass_dataset_id: str = "h3zn-uid9"  # SMS C Pass (intrastate non-hazmat, passenger)
    sms_ab_property_dataset_id: str = "4y6x-dmck"  # SMS AB PassProperty (interstate / hazmat)
    sms_c_property_dataset_id: str = "h9zy-gjn8"  # SMS C PassProperty (intrastate non-hazmat)
    crash_dataset_id: str = "aayw-vxb3"  # Crash File (FMCSA)
    sms_violation_dataset_id: str = "8mt8-2mdr"  # SMS Input - Violation (weights per violation)
    sms_crash_dataset_id: str = "4wxs-vbns"  # SMS Input - Crash (weights per crash)
    sms_census_dataset_id: str = "kjg3-diqy"  # SMS Input - Motor Carrier Census (avg PUs, VMT)
    legacy_li_frozen_on: date = date(2026, 5, 14)  # "last refreshed on 05/14/2026"

    # Login (client and internal portals). The session is a signed token in an HttpOnly cookie.
    # AUTH_SECRET_KEY must be set to a long random value outside local development.
    auth_secret_key: str = DEV_AUTH_SECRET_KEY
    auth_token_hours: float = 8.0
    auth_cookie_name: str = "carrieriq_session"
    auth_min_password_length: int = 10

    # Off: clients see only their own carriers, with no search. CLIENT_SEARCH_ENABLED=true lets
    # them search and open any carrier (used for STS team testing).
    client_search_enabled: bool = False

    # DataQs evidence files (docs/DataQ.md): a private bucket reached over the S3 protocol
    # (Supabase Storage → S3 Configuration). The keys are secrets: environment only, backend only.
    # Uploads are refused (503) while these are unset.
    dataqs_storage_endpoint: str | None = None
    dataqs_storage_region: str = "us-east-1"
    dataqs_storage_access_key_id: str | None = None
    dataqs_storage_secret_access_key: str | None = None
    dataqs_storage_bucket: str = "dataqs-evidence"
    dataqs_max_upload_mb: int = 25
    # Ask carriers to request a review this many days before the government window closes, so
    # STS has time to prepare it. An STS target, not a government rule.
    dataqs_internal_cutoff_days: int = 30
    # The representative named in every DataQs filing package.
    dataqs_representative_company: str = "Sky Transport Solutions"
    dataqs_representative_email: str = "Info@skytransportsolutions.com"
    dataqs_representative_phone: str = "8004989820"
    # DataQs emails (docs/DataQ.md), sent through the Gmail API when GMAIL_REFRESH_TOKEN is set
    # (HTTPS, so it works where SMTP ports are blocked, e.g. Render's free plan; the token comes
    # from `python -m app.workers.gmail_authorize`), else over SMTP when SMTP_HOST is set (e.g.
    # smtp.gmail.com, 587, a mailbox + its App Password), else through Resend's API
    # (RESEND_API_KEY). Email service secrets, tokens and passwords: environment only. While
    # none is set nothing is sent; emails wait in dataqs_outbox. DATAQS_EMAIL_FROM must be an
    # address the mailbox may send as (for Google: the mailbox itself or one of its aliases).
    gmail_client_id: str | None = None
    gmail_client_secret: str | None = None
    gmail_refresh_token: str | None = None
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_security: str = "starttls"  # starttls (port 587) | ssl (port 465) | none
    resend_api_key: str | None = None
    dataqs_email_from: str = "Sky Transport Solutions <dataqs@skytransportsolutions.com>"
    dataqs_email_reply_to: str = "vaishnav@skytransportsolutions.com"  # carriers' replies go here
    # While testing, send every DataQs email for carriers / for STS staff to these addresses
    # instead (comma-separated). Clear them to email the real carrier users and staff.
    dataqs_email_carrier_override: str | None = None
    dataqs_email_staff_override: str | None = None
    # Booking a call with STS about a DataQs case: a signed booking link from STS's website
    # (APPOINTMENT-SCHEDULE-LINK-API.md). Off until the token is set (Render only).
    sts_schedule_link_url: str = (
        "https://skytransportsolutions.com/api/appointment-schedule-link.ashx"
    )
    sts_schedule_link_token: str | None = None
    # Paying for a Compliance tab service: CarrierSafetyScan's own invoice, paid on Stripe
    # Checkout. Off until the secret key is set (sk_test_... while testing). The webhook
    # (PUBLIC_API_URL/api/v1/webhooks/stripe) needs its signing secret (whsec_...).
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    # Reminders to STS staff to check a filed request in DataQs, in days after filing.
    dataqs_reminder_days: str = "7,21"
    # Send the waiting emails from a thread of the API process (every 30 seconds).
    dataqs_email_dispatch_in_api: bool = True
    # Checking FMCSA's data for approved corrections (Phase 6): from a thread of the API process,
    # each case at most once per this many hours; a correction still not seen this many days
    # after the decision shows in the supervisor view.
    dataqs_verification_in_api: bool = True
    # FMCSA login codes by text and automated call (Twilio). Off until all three are set:
    # TWILIO_FROM_NUMBER is STS's Twilio number (E.164, e.g. +12095550123). Twilio's webhooks
    # (Messaging and Voice) point at PUBLIC_API_URL + /api/v1/webhooks/twilio/...
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from_number: str | None = None
    public_api_url: str = "http://localhost:8000"  # the API's public address, for Twilio
    dataqs_otp_wipe_in_api: bool = True
    # Compliance-tab service requests are emailed here (comma-separated); empty: to
    # DATAQS_EMAIL_REPLY_TO. DATAQS_EMAIL_STAFF_OVERRIDE (testing) still wins.
    compliance_request_email: str | None = None  # wipe expired login codes from a thread of the API
    dataqs_verification_check_hours: int = 24
    dataqs_verification_escalate_days: int = 60
    # Where the app's pages are, for links in emails (the frontend's address).
    public_app_url: str = "http://localhost:5173"

    # "Continue with Google" (OAuth 2.0 / OpenID Connect). Off unless both are set. The redirect
    # URI must match the one registered in Google Cloud Console exactly; in development it goes
    # through the Vite proxy so the session cookie lands on the frontend's origin.
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:5173/api/v1/auth/google/callback"

    # Bot protection on login and sign-up. Cloudflare Turnstile is off unless both keys are set.
    turnstile_site_key: str | None = None
    turnstile_secret_key: str | None = None
    rate_limit_enabled: bool = True

    @property
    def turnstile_enabled(self) -> bool:
        return bool(self.turnstile_site_key and self.turnstile_secret_key)

    @property
    def google_enabled(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def twilio_enabled(self) -> bool:
        return bool(self.twilio_account_sid and self.twilio_auth_token and self.twilio_from_number)

    @property
    def gmail_api_enabled(self) -> bool:
        return bool(self.gmail_client_id and self.gmail_client_secret and self.gmail_refresh_token)

    @property
    def dataqs_email_enabled(self) -> bool:
        return bool(self.gmail_api_enabled or self.smtp_host or self.resend_api_key)

    @property
    def dataqs_carrier_override_list(self) -> list[str]:
        return _emails(self.dataqs_email_carrier_override)

    @property
    def dataqs_staff_override_list(self) -> list[str]:
        return _emails(self.dataqs_email_staff_override)

    @property
    def compliance_request_recipients(self) -> list[str]:
        return (
            self.dataqs_staff_override_list
            or _emails(self.compliance_request_email)
            or _emails(self.dataqs_email_reply_to)
        )

    @property
    def dataqs_reminder_day_list(self) -> list[int]:
        return sorted({int(d) for d in self.dataqs_reminder_days.split(",") if d.strip()})

    @property
    def dataqs_storage_enabled(self) -> bool:
        return bool(
            self.dataqs_storage_endpoint
            and self.dataqs_storage_access_key_id
            and self.dataqs_storage_secret_access_key
        )

    @property
    def auth_cookie_secure(self) -> bool:
        """Send the cookie over HTTPS only, everywhere except local development."""
        return self.environment != "local"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


def _emails(value: str | None) -> list[str]:
    return [e.strip() for e in (value or "").split(",") if e.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
