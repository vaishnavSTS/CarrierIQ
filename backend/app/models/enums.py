"""Fixed value sets shared across tables (spec Section 11 conventions, Section 13.1).

Stored as VARCHAR + CHECK constraint rather than native PostgreSQL enums, so adding a value
later is a simple constraint change in a migration.
"""

from enum import StrEnum

from sqlalchemy import Enum


class Confidence(StrEnum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class Severity(StrEnum):
    INFO = "INFO"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class SignalStatus(StrEnum):
    OPEN = "OPEN"
    REVIEWED = "REVIEWED"
    DISMISSED = "DISMISSED"


class IngestionStatus(StrEnum):
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


class JobStatus(StrEnum):
    QUEUED = "QUEUED"  # waiting to run, possibly until run_after (a retry backoff)
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"  # gave up after max_attempts


class AddressType(StrEnum):
    PHYSICAL = "PHYSICAL"
    MAILING = "MAILING"


class PhoneType(StrEnum):
    OFFICE = "OFFICE"
    CELL = "CELL"
    FAX = "FAX"


class DomainOrigin(StrEnum):
    EMAIL = "EMAIL"
    WEBSITE = "WEBSITE"


class DocketPrefix(StrEnum):
    MC = "MC"
    MX = "MX"
    FF = "FF"


class OrganizationKind(StrEnum):
    STS = "STS"  # STS itself: its users get the internal portal
    CLIENT = "CLIENT"  # an STS client: its users get the client portal
    BROKER = "BROKER"  # a freight brokerage: its users get the broker portal


class UserRole(StrEnum):
    STS_ADMIN = "STS_ADMIN"  # internal portal + approves client accounts
    STS_ANALYST = "STS_ANALYST"  # internal portal
    CLIENT_ADMIN = "CLIENT_ADMIN"  # client portal, their organization
    CLIENT_USER = "CLIENT_USER"  # client portal, view only
    BROKER_ADMIN = "BROKER_ADMIN"  # broker portal, their brokerage
    BROKER_USER = "BROKER_USER"  # broker portal

    @property
    def is_staff(self) -> bool:
        return self in (UserRole.STS_ADMIN, UserRole.STS_ANALYST)

    @property
    def is_client(self) -> bool:
        return self in (UserRole.CLIENT_ADMIN, UserRole.CLIENT_USER)

    @property
    def is_broker(self) -> bool:
        return self in (UserRole.BROKER_ADMIN, UserRole.BROKER_USER)

    @property
    def portal(self) -> str:
        """internal | client | broker: where this role's users land after logging in."""
        return "internal" if self.is_staff else "broker" if self.is_broker else "client"


class UserStatus(StrEnum):
    PENDING = "PENDING"  # registered, waiting for STS approval; cannot log in
    ACTIVE = "ACTIVE"
    DISABLED = "DISABLED"


# --- DataQs: requests to correct FMCSA safety records (docs/DataQ.md) -------------------------


class DataQsRoute(StrEnum):
    DATAQS = "DATAQS"  # a DataQs request for data review (inspections, violations, citations)
    CPDP = "CPDP"  # Crash Preventability Determination Program: separate program, later release


class DataQsEventType(StrEnum):
    INSPECTION = "INSPECTION"
    CRASH = "CRASH"


class DataQsWorkStatus(StrEnum):
    """Where the case is in STS's own work, apart from the government's status."""

    DRAFT = "DRAFT"
    EVIDENCE_NEEDED = "EVIDENCE_NEEDED"
    STAFF_REVIEW = "STAFF_REVIEW"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    READY_TO_FILE = "READY_TO_FILE"
    SUBMISSION_UNCONFIRMED = "SUBMISSION_UNCONFIRMED"  # filing attempted, no acknowledgement yet
    MONITORING = "MONITORING"  # filed; waiting on the agency
    VERIFICATION = "VERIFICATION"  # decided; checking the FMCSA record actually changed
    CLOSED = "CLOSED"


class DataQsReviewLevel(StrEnum):
    INITIAL = "INITIAL"
    RECONSIDERATION = "RECONSIDERATION"
    FINAL = "FINAL"


class DataQsActionOwner(StrEnum):
    """Who has to act next."""

    CARRIER = "CARRIER"
    STS = "STS"
    AGENCY = "AGENCY"


class DataQsOutcome(StrEnum):
    FULL_CORRECTION = "FULL_CORRECTION"
    PARTIAL_CORRECTION = "PARTIAL_CORRECTION"
    NO_CORRECTION = "NO_CORRECTION"
    PROCEDURAL_CLOSURE = "PROCEDURAL_CLOSURE"  # insufficient information or no response, not merits
    WITHDRAWN = "WITHDRAWN"


class DataQsReason(StrEnum):
    """Why the carrier believes an issue is wrong: DataQs's own reasons for an inspection report
    (its request wizard, step 3), so the filing uses the same choice. UNSURE is ours: STS picks
    the DataQs reason when it prepares the package."""

    CITATION_OUTCOME = "CITATION_OUTCOME"  # citation associated with a violation (court outcome)
    VIOLATION_INCORRECT = "VIOLATION_INCORRECT"  # incorrect, listed twice, or missing IEP/shipper
    WRONG_CARRIER = "WRONG_CARRIER"  # company and/or USDOT number listed incorrectly
    DRIVER_INCORRECT = "DRIVER_INCORRECT"  # driver name and/or license number listed incorrectly
    DUPLICATE_INSPECTION = "DUPLICATE_INSPECTION"  # the same inspection listed more than once
    INCORRECT_INFORMATION = "INCORRECT_INFORMATION"  # other report data (level, location, ...)
    COPY_REQUEST = "COPY_REQUEST"  # did not receive a copy of the inspection, or lost it
    MISSING_INSPECTION = "MISSING_INSPECTION"  # an inspection missing from the record
    UNSURE = "UNSURE"


class DataQsAssessmentOutcome(StrEnum):
    """STS's assessment of a submitted case (docs/DataQ.md, Phase 3)."""

    READY_TO_PREPARE = "READY_TO_PREPARE"  # build the filing package
    EVIDENCE_NEEDED = "EVIDENCE_NEEDED"  # back to the carrier for more evidence
    PENDING_EXTERNAL = "PENDING_EXTERNAL"  # waiting on something outside (e.g. a court date)
    SPECIALIST_REVIEW = "SPECIALIST_REVIEW"  # needs a more experienced reviewer
    INSUFFICIENT_BASIS = "INSUFFICIENT_BASIS"  # STS will not file it; the case closes


class DataQsScanStatus(StrEnum):
    PENDING = "PENDING"
    CLEAN = "CLEAN"
    INFECTED = "INFECTED"
    FAILED = "FAILED"


class DataQsAuthorizationKind(StrEnum):
    SERVICE_CONSENT = "SERVICE_CONSENT"  # general authority for STS to act on this case
    PACKAGE_APPROVAL = "PACKAGE_APPROVAL"  # approval to file one exact package (by its hash)


class DataQsAttemptStatus(StrEnum):
    STARTED = "STARTED"
    UNCONFIRMED = "UNCONFIRMED"  # e.g. the portal timed out: reconcile before retrying
    CONFIRMED = "CONFIRMED"  # acknowledgement / receipt recorded
    ABANDONED = "ABANDONED"


class DataQsCorrespondenceSource(StrEnum):
    DATAQS_PORTAL = "DATAQS_PORTAL"
    EMAIL = "EMAIL"
    PHONE = "PHONE"
    OTHER = "OTHER"


class DataQsCorrespondenceKind(StrEnum):
    ACKNOWLEDGEMENT = "ACKNOWLEDGEMENT"
    INFO_REQUEST = "INFO_REQUEST"  # agency asks the requester for information: pauses the clock
    INFO_RESPONSE = "INFO_RESPONSE"  # requester answers: resumes the clock
    OPENED = "OPENED"  # the assigned agency opened the request (DataQs history: "Opened")
    DECISION = "DECISION"
    REOPENING = "REOPENING"
    OTHER = "OTHER"


class DataQsClockType(StrEnum):
    FILING_WINDOW = "FILING_WINDOW"  # from the event date: 3 years inspections, 5 years crashes
    AGENCY_REVIEW = "AGENCY_REVIEW"  # 21 / 21 / 45 days from the confirmed stage request
    REQUESTER_INFO = "REQUESTER_INFO"  # 14 days to answer an agency information request
    APPEAL = "APPEAL"  # 30 days from the prior decision's issue date
    INTERNAL = "INTERNAL"  # STS's own earlier targets, never shown as government rules


class DataQsOutboxStatus(StrEnum):
    PENDING = "PENDING"  # waiting to be sent (now, or at next_attempt_at for a reminder)
    SENT = "SENT"
    FAILED = "FAILED"  # gave up after retries
    CANCELLED = "CANCELLED"  # no longer needed, e.g. a reminder for a case that closed


class DataQsVerificationStatus(StrEnum):
    """Whether FMCSA's data shows a correction the agency approved (Phase 6)."""

    WAITING = "WAITING"  # not seen in FMCSA's data yet; checked again daily
    VERIFIED = "VERIFIED"  # seen by the check, or confirmed by STS with proof
    REVIEW = "REVIEW"  # the record changed (or can't be told apart): STS confirms by hand
    MANUAL = "MANUAL"  # not in FMCSA's public data (driver details): STS confirms with proof


class DataQsOtpMethod(StrEnum):
    """How the carrier wants to give STS the FMCSA login code (the one-time code FMCSA sends)."""

    TEXT = "TEXT"  # STS texts the carrier; the carrier replies with the code
    AI_CALL = "AI_CALL"  # an automated call asks the carrier to key in or say the code
    SCHEDULED_CALL = "SCHEDULED_CALL"  # an STS staff member calls at a time the carrier chose
    # The carrier approves STS as an associate of their company in the FMCSA Portal
    # (Account Management > Pending Account Requests); STS then uses its own login, no code.
    AUTHORIZED_AGENT = "AUTHORIZED_AGENT"


class DataQsAgentAccess(StrEnum):
    """STS's access to the carrier's company in the FMCSA Portal (AUTHORIZED_AGENT)."""

    REQUESTED = "REQUESTED"  # the carrier asked STS to request access
    SENT = "SENT"  # STS requested it in the FMCSA Portal; the carrier must approve it
    GRANTED = "GRANTED"  # the carrier approved it


class DataQsOtpStatus(StrEnum):
    SENT = "SENT"  # text sent / call placed, waiting for the code
    RECEIVED = "RECEIVED"  # the code arrived (visible to the staff member who asked)
    USED = "USED"  # the staff member marked it used; the code is wiped
    EXPIRED = "EXPIRED"  # no code in time, or the code's 10 minutes passed; wiped
    FAILED = "FAILED"  # Twilio refused the text or call


class ComplianceService(StrEnum):
    """A compliance service STS offers clients (the carrier profile's Compliance tab)."""

    DOT_MC_AUTHORITY = "DOT_MC_AUTHORITY"  # reactivating USDOT / MC authority (motus.dot.gov)
    UCR = "UCR"  # Unified Carrier Registration filing (ucr.gov)
    CA_MCP = "CA_MCP"  # California Motor Carrier Permit (CA DMV), California-based carriers
    DRUG_ALCOHOL = "DRUG_ALCOHOL"  # enrolment in STS's drug and alcohol testing consortium
    DRIVER_FILES = "DRIVER_FILES"  # driver qualification files for new hires
    MVR = "MVR"  # motor vehicle record report
    BACKGROUND_CHECK = "BACKGROUND_CHECK"  # criminal background check
    GOOD_STANDING = "GOOD_STANDING"  # certificate of good standing for the corporation
    CLEARINGHOUSE = "CLEARINGHOUSE"  # FMCSA Drug & Alcohol Clearinghouse registration


class ComplianceRequestStatus(StrEnum):
    OPEN = "OPEN"  # STS hasn't handled it yet
    HANDLED = "HANDLED"  # an STS staff member followed up


def enum_type(enum_cls: type[StrEnum], name: str, length: int = 20) -> Enum:
    """VARCHAR column restricted to the enum's values by a CHECK constraint named after `name`."""
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        validate_strings=True,
        length=length,
        values_callable=lambda cls: [member.value for member in cls],
    )
