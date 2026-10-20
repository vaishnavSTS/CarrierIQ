"""Chameleon check tab: other USDOT numbers that share this carrier's identity details, what
happened to them, and how much of its fleet was also inspected under other USDOT numbers.

Every field reports what FMCSA's records show; none is a verdict on the carrier."""

from datetime import date, datetime

from pydantic import BaseModel


class ChameleonShareOut(BaseModel):
    # ein | phone | email | address | building | officer | duns | mailing_address
    kind: str
    # the shared value as FMCSA has it on the other carrier's record; None for an EIN, which
    # is compared but never returned
    value: str | None
    past: bool  # the value is one this carrier used before, not its current one


class ChameleonLinkedOut(BaseModel):
    usdot_number: int
    legal_name: str | None
    status: str | None  # ACTIVE | INACTIVE (census status); None when not in the census rows
    registered: date | None  # the linked USDOT number's census add date
    shares: list[ChameleonShareOut]  # strongest first
    # Distinct kinds of detail shared (a past and a current phone count once; another unit in
    # the same building does not count: it is weak on its own)
    distinct_kinds: int
    shared_vins: int  # this carrier's VINs also inspected under the linked USDOT number
    revocations: list[date]  # served dates of authority revocation / suspension orders
    oos_orders: list[date]  # dates of out-of-service orders
    active_oos_order: bool
    shutdown_date: date | None  # the most recent revocation or out-of-service order
    # Days from shutdown_date to this carrier's USDOT add date (positive: added afterwards)
    days_after_shutdown: int | None
    first_linked: date | None  # when CarrierSafetyScan first saw a shared detail


class PriorRevokeOut(BaseModel):
    flagged: bool  # FMCSA's census prior_revoke_flag
    usdot_number: int | None  # the revoked USDOT number FMCSA links, if another one


class FleetOverlapOut(BaseModel):
    window_months: int  # power units seen on inspections in this many months
    power_units_seen: int
    shared_power_units: int  # of those, VINs also inspected under another USDOT number
    percent: float | None  # None with no power units seen
    threshold_percent: int  # reference level: CarrierOK flags 60% or more
    over_threshold: bool


class ChameleonSummaryOut(BaseModel):
    linked_carriers: int
    shut_down: int  # linked carriers with a revocation or out-of-service order
    sharing_two_or_more: int  # linked carriers sharing 2+ distinct kinds of detail
    added_within_year_after_shutdown: int  # this carrier added 0-365 days after their shutdown


class ChameleonOut(BaseModel):
    usdot_number: int
    registered: date | None  # this carrier's census add date
    prior_revoke: PriorRevokeOut
    fleet_overlap: FleetOverlapOut
    linked: list[ChameleonLinkedOut]  # strongest first
    summary: ChameleonSummaryOut
    # Whether FMCSA QCMobile gave this carrier's EIN, to compare with the linked carriers'
    # EINs. The number itself is never returned.
    ein_known: bool = False
    eins_compared: int = 0  # linked carriers whose EIN was known and compared
    links_checked_at: datetime | None
    orders_checked: bool  # False: FMCSA's order datasets could not be reached this time
    truncated: bool  # more linked carriers than were looked up
    note: str | None
