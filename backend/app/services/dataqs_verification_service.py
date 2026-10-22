"""Checking that FMCSA's data shows a correction the agency approved (docs/DataQ.md, Phase 6).

An approval is never shown as a verified correction until the data changes. Each corrected issue
goes through four milestones: requested -> agency decision -> FMCSA record changed -> shown in
CarrierSafetyScan.

While a corrected issue is unconfirmed, the inspection is fetched again by its id from FMCSA's
Vehicle Inspection File (at most every DATAQS_VERIFICATION_CHECK_HOURS) and compared with the copy
kept when the case was opened:
- no longer in the file, or now listed under another USDOT: every issue is verified (the record
  left the carrier), unless the inspection is at the end of the file's three-year window, when it
  may simply have aged out: STS checks by hand;
- a violation no longer listed (or listed fewer times): verified;
- the violation still listed but changed (out of service, description, citation), or the
  inspection's details changed for a whole-inspection issue: STS confirms it is the correction
  asked for;
- driver details are not in FMCSA's public data: STS confirms with proof (a PSP report, DataQs);
- wrong carrier and duplicate requests wait for the inspection to leave the carrier.

Every look is kept (dataqs_verification_checks), with FMCSA's copy each time it changes. When an
issue is verified the carrier is emailed, and CarrierSafetyScan's copy of the carrier's
inspections is refreshed; the fourth milestone is reached once that copy matches FMCSA's. When
every corrected issue is verified, STS gets a task to close the file. A correction still unseen
DATAQS_VERIFICATION_ESCALATE_DAYS after the decision shows in the supervisor view.
"""

import logging
import threading
from collections import defaultdict
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any, Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import DataQsInvalidTransitionError, DataQsMissingAuthorityError
from app.ingestion.socrata_client import SocrataClient
from app.ingestion.vehicle_inspection_normalizer import normalize_inspection
from app.ingestion.vehicle_inspections import VehicleInspectionAdapter
from app.models import DataQsCase, DataQsIssue, DataQsVerificationCheck, User
from app.models.enums import (
    DataQsActionOwner,
    DataQsOutcome,
    DataQsReason,
    DataQsVerificationStatus,
    DataQsWorkStatus,
)
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.schemas.dataqs import DataQsVerifyIssueIn
from app.services import dataqs_eligibility
from app.services.dataqs_access import DataQsAccess
from app.services.dataqs_notifications import DataQsNotifications

logger = logging.getLogger(__name__)

Status = DataQsVerificationStatus
# Not yet confirmed: the check keeps looking.
OPEN = (Status.WAITING, Status.REVIEW, Status.MANUAL)
# The inspection file keeps about three years: near the end, a missing inspection may have aged out.
AGE_OUT_MARGIN = timedelta(days=30)
# After a failed look, try again sooner than the daily check.
RETRY_AFTER = timedelta(hours=1)
HEADER_FIELDS = {
    "inspection_date": "Date",
    "level": "Level",
    "state": "State",
    "location": "Location",
}
VIOLATION_FIELDS = {
    "out_of_service": "out of service",
    "description": "description",
    "citation_number": "citation",
}
DRIVER_NOTE = (
    "Driver details aren't in FMCSA's public data. Confirm the correction with proof, e.g. a PSP "
    "report or the request's history in DataQs."
)


def _now() -> datetime:
    return datetime.now(UTC)


# --- Comparing two copies of the inspection ----------------------------------------------------


def comparable(
    inspection_date: date | str | None,
    level: int | None,
    state: str | None,
    location: str | None,
    violations: Iterable[dict[str, Any]],
) -> dict[str, Any]:
    """The parts of an inspection a correction can change, in the case snapshot's shape."""
    return {
        "inspection_date": (
            inspection_date.isoformat() if isinstance(inspection_date, date) else inspection_date
        ),
        "level": level,
        "state": state,
        "location": location,
        "violations": [
            {
                "code": v.get("code"),
                "description": v.get("description"),
                "applies_to": v.get("applies_to"),
                "unit_number": v.get("unit_number"),
                "out_of_service": bool(v.get("out_of_service")),
                "citation_number": v.get("citation_number"),
            }
            for v in violations
        ],
    }


def violation_key(v: dict[str, Any]) -> tuple[str | None, str | None]:
    """(code, unit) as an issue records it: "D" for the driver, else the vehicle unit number."""
    if v.get("applies_to") == "DRIVER":
        return v.get("code"), "D"
    unit = v.get("unit_number")
    return v.get("code"), str(unit) if unit is not None else None


def violation_name(key: tuple[str | None, str | None]) -> str:
    code, unit = key
    where = " (driver)" if unit == "D" else f" (unit {unit})" if unit else ""
    return f"Violation {code or '?'}{where}"


def _by_key(event: dict[str, Any]) -> dict[tuple[str | None, str | None], list[dict[str, Any]]]:
    found: dict[tuple[str | None, str | None], list[dict[str, Any]]] = defaultdict(list)
    for v in event.get("violations") or []:
        found[violation_key(v)].append(v)
    return found


def _shown(value: object) -> str:
    if isinstance(value, bool):
        return "yes" if value else "no"
    return "—" if value in (None, "") else str(value)


def differences(before: dict[str, Any], after: dict[str, Any]) -> list[str]:
    """What changed between two copies of the inspection, in words."""
    changes = [
        f"{label} changed from {_shown(before.get(field))} to {_shown(after.get(field))}"
        for field, label in HEADER_FIELDS.items()
        if before.get(field) != after.get(field)
    ]
    old, new = _by_key(before), _by_key(after)
    for key in sorted(set(old) | set(new), key=lambda k: (k[0] or "", k[1] or "")):
        was, now, name = old.get(key, []), new.get(key, []), violation_name(key)
        if len(now) != len(was):
            changes.append(
                f"{name} removed"
                if not now
                else f"{name} added"
                if not was
                else f"{name} listed {len(now)} times instead of {len(was)}"
            )
            continue
        for a, b in zip(was, now, strict=True):
            changes.extend(
                f"{name}: {label} changed from {_shown(a.get(field))} to {_shown(b.get(field))}"
                for field, label in VIOLATION_FIELDS.items()
                if a.get(field) != b.get(field)
            )
    return changes


# --- What FMCSA shows now ----------------------------------------------------------------------


@dataclass(frozen=True)
class FmcsaRecord:
    """The inspection as FMCSA's file shows it now."""

    usdot_number: int | None
    event: dict[str, Any]  # comparable()


class FmcsaSource(Protocol):
    def inspection(self, inspection_id: str) -> FmcsaRecord | None:
        """The inspection now, or None when it is no longer in FMCSA's file."""
        ...

    def refresh_carrier(self, db: Session, usdot_number: int) -> None:
        """Fetch the carrier's inspections into CarrierSafetyScan again."""
        ...


class SocrataFmcsa:
    """FMCSA's Socrata datasets (the Vehicle Inspection File, its units and violations)."""

    def __init__(self, client: SocrataClient) -> None:
        self.client = client
        self.adapter = VehicleInspectionAdapter(client)

    def inspection(self, inspection_id: str) -> FmcsaRecord | None:
        headers = [
            h
            for h in self.adapter.fetch_headers([inspection_id])
            if h.get("inspection_id") == inspection_id
        ]
        if not headers:
            return None
        values = normalize_inspection(
            headers[0],
            self.adapter.fetch_units([inspection_id]),
            self.adapter.fetch_violations([inspection_id]),
        )
        dot = str(headers[0].get("dot_number") or "")
        return FmcsaRecord(
            usdot_number=int(dot) if dot.isdigit() else None,
            event=comparable(
                values.inspection_date,
                values.inspection_level,
                values.state,
                values.location,
                values.violation_data.get("violations", []),
            ),
        )

    def refresh_carrier(self, db: Session, usdot_number: int) -> None:
        from app.services.inspection_ingestion_service import build_inspection_ingestion_service

        build_inspection_ingestion_service(db, self.client).ingest(usdot_number)


# --- One issue against FMCSA's record ----------------------------------------------------------


@dataclass(frozen=True)
class Finding:
    status: DataQsVerificationStatus
    note: str


def assess(
    issue: DataQsIssue,
    original: dict[str, Any],
    found: FmcsaRecord | None,
    usdot_number: int,
    aged_out: bool,
) -> Finding:
    """What FMCSA's record says about one corrected issue."""
    if found is None or found.usdot_number != usdot_number:
        if found is None and aged_out:
            return Finding(
                Status.REVIEW,
                "The inspection is no longer in FMCSA's inspection file, but it is also at the "
                "end of the file's three-year window, so the check can't tell a correction from "
                "the record ageing out. Confirm in DataQs or with a PSP report.",
            )
        where = (
            "is no longer in FMCSA's inspection file"
            if found is None
            else f"is now listed under USDOT {found.usdot_number or 'unknown'}"
        )
        return Finding(Status.VERIFIED, f"The inspection {where}.")
    if issue.reason == DataQsReason.DRIVER_INCORRECT:
        return Finding(Status.MANUAL, DRIVER_NOTE)
    if issue.reason in (DataQsReason.WRONG_CARRIER, DataQsReason.DUPLICATE_INSPECTION):
        return Finding(
            Status.WAITING, f"The inspection is still listed under USDOT {usdot_number}."
        )
    if issue.violation_code is not None:
        key = (issue.violation_code, issue.violation_unit)
        name = violation_name(key)
        was = _by_key(original).get(key, [])
        now = _by_key(found.event).get(key, [])
        if len(now) < max(len(was), 1):
            return Finding(
                Status.VERIFIED,
                f"{name} is no longer listed."
                if not now
                else f"{name} is now listed {len(now)} times instead of {len(was)}.",
            )
        changed = differences({"violations": was}, {"violations": now})
        if changed:
            return Finding(
                Status.REVIEW,
                "FMCSA's record changed: " + "; ".join(changed) + ". Confirm it is the "
                "correction the agency approved.",
            )
        return Finding(Status.WAITING, f"{name} is still listed as it was.")
    changed = differences(original, found.event)
    if changed:
        return Finding(
            Status.REVIEW,
            "FMCSA's record changed: " + "; ".join(changed) + ". Confirm it is the correction "
            "the agency approved.",
        )
    return Finding(Status.WAITING, "FMCSA's record hasn't changed yet.")


def start_verification(issue: DataQsIssue) -> None:
    """An issue the agency just corrected: waiting to be seen in FMCSA's data."""
    issue.verification_status = (
        Status.MANUAL if issue.reason == DataQsReason.DRIVER_INCORRECT else Status.WAITING
    )
    issue.verification_note = DRIVER_NOTE if issue.verification_status == Status.MANUAL else None
    issue.verified_at = issue.verified_by_id = issue.shown_at = None


def unverified(issues: Iterable[DataQsIssue]) -> list[DataQsIssue]:
    """Corrected issues FMCSA's data doesn't show yet."""
    return [
        i
        for i in issues
        if i.outcome == DataQsOutcome.FULL_CORRECTION and i.verification_status in OPEN
    ]


# --- The service -------------------------------------------------------------------------------


class DataQsVerificationService:
    def __init__(self, db: Session, source: FmcsaSource | None = None) -> None:
        self.db = db
        self.source = source
        self.repository = DataQsCaseRepository(db)
        self.access = DataQsAccess(db, self.repository)
        self.notifications = DataQsNotifications(db)

    def checks(self, case_id: int) -> list[DataQsVerificationCheck]:
        return list(
            self.db.scalars(
                select(DataQsVerificationCheck)
                .where(DataQsVerificationCheck.case_id == case_id)
                .order_by(DataQsVerificationCheck.created_at, DataQsVerificationCheck.id)
            )
        )

    @staticmethod
    def to_check(issues: Iterable[DataQsIssue]) -> list[DataQsIssue]:
        """Corrected issues to confirm, or confirmed but not yet shown in CarrierSafetyScan."""
        return [
            i
            for i in issues
            if i.outcome == DataQsOutcome.FULL_CORRECTION
            and (
                i.verification_status in OPEN
                or (i.verification_status == Status.VERIFIED and i.shown_at is None)
            )
        ]

    def due_cases(self, now: datetime | None = None) -> list[int]:
        """Cases to look at now: open, with something to confirm, not looked at recently."""
        now = now or _now()
        every = timedelta(hours=get_settings().dataqs_verification_check_hours)
        cases = [
            c
            for c in self.repository.list_cases()
            if c.work_status not in (DataQsWorkStatus.DRAFT, DataQsWorkStatus.CLOSED)
        ]
        issues: dict[int, list[DataQsIssue]] = defaultdict(list)
        for issue in self.repository.issues([c.id for c in cases]):
            issues[issue.case_id].append(issue)
        due = []
        for case in cases:
            if not self.to_check(issues[case.id]):
                continue
            last = self.db.scalar(
                select(DataQsVerificationCheck)
                .where(DataQsVerificationCheck.case_id == case.id)
                .order_by(
                    DataQsVerificationCheck.created_at.desc(), DataQsVerificationCheck.id.desc()
                )
                .limit(1)
            )
            if last is None or now - last.created_at >= (RETRY_AFTER if last.error else every):
                due.append(case.id)
        return due

    def check(self, case: DataQsCase, now: datetime | None = None) -> DataQsVerificationCheck:
        """Look at FMCSA's record once, update the issues and commit."""
        if self.source is None:
            raise RuntimeError("No FMCSA source to check against")
        now = now or _now()
        issues = self.repository.issues([case.id])
        try:
            found = self.source.inspection(case.source_event_id)
        except Exception as exc:  # FMCSA down, timeout, bad data: try again later
            logger.warning("DataQs case %s: FMCSA check failed: %s", case.id, exc)
            row = DataQsVerificationCheck(
                case_id=case.id, created_at=now, error=str(exc)[:500] or type(exc).__name__
            )
            self.db.add(row)
            self.db.commit()
            return row

        event = case.source_snapshot["event"]
        original = comparable(
            event.get("inspection_date"),
            event.get("level"),
            event.get("state"),
            event.get("location"),
            event.get("violations") or [],
        )
        row = self._record(case, found, original, now)
        newly: list[DataQsIssue] = []
        aged_out = self._aged_out(case, now)
        for issue in unverified(issues):
            finding = assess(issue, original, found, case.usdot_number, aged_out)
            issue.verification_note = finding.note
            if finding.status == Status.VERIFIED:
                issue.verification_status, issue.verified_at = Status.VERIFIED, now
                issue.verified_by_id = None
                newly.append(issue)
            else:
                issue.verification_status = finding.status
        if newly:
            self.repository.audit(
                case,
                None,
                "verification.seen",
                after={"issue_ids": [i.id for i in newly], "check_id": row.id},
            )
            self._verified(case, newly, by=None, now=now)
        self.db.commit()
        self._show(case, issues, found, now)
        return row

    def _aged_out(self, case: DataQsCase, now: datetime) -> bool:
        if case.event_date is None:
            return True
        ends = dataqs_eligibility.anniversary(
            case.event_date, dataqs_eligibility.WINDOW_YEARS[case.event_type]
        )
        return now.date() >= ends - AGE_OUT_MARGIN

    def _record(
        self,
        case: DataQsCase,
        found: FmcsaRecord | None,
        original: dict[str, Any],
        now: datetime,
    ) -> DataQsVerificationCheck:
        """Keep this look; FMCSA's copy only when it differs from the last one kept."""
        kept = self.db.scalar(
            select(DataQsVerificationCheck)
            .where(
                DataQsVerificationCheck.case_id == case.id,
                DataQsVerificationCheck.changes.is_not(None),
            )
            .order_by(DataQsVerificationCheck.created_at.desc(), DataQsVerificationCheck.id.desc())
            .limit(1)
        )
        state = (
            found is not None,
            found.usdot_number if found else None,
            found.event if found else None,
        )
        changed = kept is None or (kept.found, kept.usdot_number, kept.record) != state
        row = DataQsVerificationCheck(
            case_id=case.id,
            created_at=now,
            found=found is not None,
            usdot_number=found.usdot_number if found else None,
        )
        if changed:
            row.record = found.event if found else None
            if found is None:
                row.changes = ["No longer in FMCSA's inspection file"]
            else:
                row.changes = differences(original, found.event)
                if found.usdot_number != case.usdot_number:
                    row.changes.insert(
                        0, f"Now listed under USDOT {found.usdot_number or 'unknown'}"
                    )
        self.db.add(row)
        self.db.flush()
        return row

    def _verified(
        self, case: DataQsCase, issues: list[DataQsIssue], by: User | None, now: datetime
    ) -> None:
        """Tell the carrier; once nothing is left to confirm, STS closes the file."""
        names = "\n".join(f"- {self.label(i)}" for i in issues)
        request = case.gov_request_id or f"case {case.id}"
        seen = (
            "STS has confirmed that FMCSA's records now show the correction"
            if by
            else "FMCSA's inspection record now shows the correction"
        )
        self.notifications.to_carrier(
            case,
            "CORRECTION_VERIFIED",
            f"FMCSA's record shows the correction: DataQs request {request}",
            f"{seen} for inspection {case.source_event_id} (DataQs request {request}):\n\n"
            f"{names}\n\nFMCSA recalculates CSA (SMS) measures in its monthly update, so your "
            "scores can take up to a month to reflect it.",
        )
        if not unverified(self.repository.issues([case.id])):
            self.repository.complete_tasks(case, {"VERIFY_CORRECTION"}, by, now)
            if not any(t.kind == "CLOSE_VERIFIED" for t in self.repository.open_tasks([case.id])):
                self.repository.add_task(
                    case,
                    "CLOSE_VERIFIED",
                    "FMCSA's data shows every correction: close the file",
                    DataQsActionOwner.STS,
                    assignee_id=case.owner_id,
                )

    def _show(
        self, case: DataQsCase, issues: list[DataQsIssue], found: FmcsaRecord | None, now: datetime
    ) -> None:
        """The fourth milestone: CarrierSafetyScan's copy matches FMCSA's corrected record."""
        waiting = [
            i for i in issues if i.verification_status == Status.VERIFIED and i.shown_at is None
        ]
        if not waiting or self.source is None:
            return
        gone = found is None or found.usdot_number != case.usdot_number
        if not self._matches(case, found, gone):
            if gone:
                # FMCSA removed it from this carrier; the refresh never deletes inspections.
                local = self._local(case)
                if local is not None:
                    self.db.delete(local)
                    self.db.commit()
            else:
                try:
                    self.source.refresh_carrier(self.db, case.usdot_number)
                except Exception as exc:  # tried again on the next check
                    self.db.rollback()
                    logger.warning(
                        "DataQs case %s: refreshing USDOT %s failed: %s",
                        case.id,
                        case.usdot_number,
                        exc,
                    )
                    return
            if not self._matches(case, found, gone):
                return
        for issue in waiting:
            issue.shown_at = now
        self.db.commit()

    def _local(self, case: DataQsCase) -> Any:
        carrier = self.repository.carrier(case.usdot_number)
        if carrier is None:
            return None
        return self.repository.inspection(carrier.id, case.source_event_id)

    def _matches(self, case: DataQsCase, found: FmcsaRecord | None, gone: bool) -> bool:
        local = self._local(case)
        if gone or found is None:
            return local is None
        if local is None:
            return False
        mine = comparable(
            local.inspection_date,
            local.inspection_level,
            local.state,
            local.location,
            (local.violation_data or {}).get("violations", []),
        )
        return not differences(mine, found.event)

    @staticmethod
    def label(issue: DataQsIssue) -> str:
        if issue.violation_code is None:
            return "The whole inspection"
        description = (issue.violation_snapshot or {}).get("description")
        return f"{description or 'Violation'} ({issue.violation_code})"

    # --- Staff actions ----------------------------------------------------------------------------

    def _staff_case(self, user: User, case_id: int) -> DataQsCase:
        if not user.role.is_staff:
            raise DataQsMissingAuthorityError("Only STS staff check corrections")
        case = self.access.case_to_act_on(user, case_id)
        if case.work_status == DataQsWorkStatus.CLOSED:
            raise DataQsInvalidTransitionError("This file is closed")
        return case

    def check_now(self, user: User, case_id: int) -> DataQsCase:
        """STS: look at FMCSA's record now instead of waiting for the daily check."""
        case = self._staff_case(user, case_id)
        if not self.to_check(self.repository.issues([case.id])):
            raise DataQsInvalidTransitionError("There is no approved correction to check")
        self.check(case)
        return case

    def confirm(
        self, user: User, case_id: int, issue_id: int, body: DataQsVerifyIssueIn
    ) -> DataQsCase:
        """STS confirms by hand, with the proof, that FMCSA's records show the correction."""
        case = self._staff_case(user, case_id)
        issue = next((i for i in self.repository.issues([case.id]) if i.id == issue_id), None)
        if issue is None or not unverified([issue]):
            raise DataQsInvalidTransitionError("That issue has no correction waiting to confirm")
        now = _now()
        before = {"verification_status": issue.verification_status}
        issue.verification_status, issue.verified_at, issue.verified_by_id = (
            Status.VERIFIED,
            now,
            user.id,
        )
        issue.verification_note = body.note.strip()
        self.repository.audit(
            case,
            user,
            "verification.confirmed",
            before=before,
            after={"issue_id": issue.id, "note": issue.verification_note},
        )
        self._verified(case, [issue], by=user, now=now)
        self.db.commit()
        return case


def get_fmcsa_source() -> Iterator[FmcsaSource]:
    """FastAPI dependency: FMCSA's live data for one request."""
    client = SocrataClient()
    try:
        yield SocrataFmcsa(client)
    finally:
        client.close()


def run_verifier(
    stop: threading.Event, interval_seconds: float = 3600.0, first_after: float = 60.0
) -> None:
    """Check due cases against FMCSA until `stop` is set (a thread of the API process): shortly
    after start, then every `interval_seconds`. One case failing never stops the others."""
    from app.db.session import SessionLocal

    if stop.wait(first_after):
        return
    while not stop.is_set():
        try:
            with SessionLocal() as db:
                due = DataQsVerificationService(db).due_cases()
            if due:
                client = SocrataClient()
                try:
                    for case_id in due:
                        with SessionLocal() as db:
                            case = db.get(DataQsCase, case_id)
                            if case is not None:
                                DataQsVerificationService(db, SocrataFmcsa(client)).check(case)
                finally:
                    client.close()
                logger.info("DataQs: checked %d case(s) against FMCSA", len(due))
        except Exception:  # keep the thread alive; the next round tries again
            logger.exception("DataQs verification round failed")
        stop.wait(interval_seconds)
