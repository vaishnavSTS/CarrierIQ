"""ORM models, one per table. Importing this package registers every table on Base.metadata."""

from app.models.address import Address
from app.models.authority import Authority
from app.models.authority_history import AuthorityHistory
from app.models.carrier import Carrier
from app.models.carrier_attribute_history import CarrierAttributeHistory
from app.models.carrier_snapshot import CarrierSnapshot
from app.models.crash import Crash
from app.models.domain import Domain
from app.models.identity_event import IdentityEvent
from app.models.ingestion_run import IngestionRun
from app.models.inspection import Inspection
from app.models.insurance import Insurance
from app.models.intelligence_signal import IntelligenceSignal
from app.models.job import Job
from app.models.officer import Officer
from app.models.phone import Phone
from app.models.process_agent import ProcessAgent
from app.models.raw_record import RawRecord
from app.models.relationship import Relationship
from app.models.signal_evidence import SignalEvidence
from app.models.sms_result import SmsResult
from app.models.timeline_event import TimelineEvent
from app.models.vehicle import Vehicle
from app.models.worker_heartbeat import WorkerHeartbeat

__all__ = [
    "Address",
    "Authority",
    "AuthorityHistory",
    "Carrier",
    "CarrierAttributeHistory",
    "CarrierSnapshot",
    "Crash",
    "Domain",
    "IdentityEvent",
    "IngestionRun",
    "Insurance",
    "Inspection",
    "IntelligenceSignal",
    "Job",
    "Officer",
    "Phone",
    "ProcessAgent",
    "RawRecord",
    "Relationship",
    "SignalEvidence",
    "SmsResult",
    "TimelineEvent",
    "Vehicle",
    "WorkerHeartbeat",
]
