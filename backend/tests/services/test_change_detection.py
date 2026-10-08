"""Authority and insurance change detection on in-memory records (no database)."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from app.ingestion.insurance_normalizer import legacy_past, motus_current
from app.ingestion.operating_authority_normalizer import legacy_events, motus_events
from app.models import Authority, AuthorityHistory, Insurance
from app.models.enums import DocketPrefix, Severity
from app.services.change_detection import authority_events, insurance_events
from tests.ingestion.helpers import load_authority_rows, load_insurance_rows

TODAY = date(2026, 10, 8)
MC = DocketPrefix.MC


def history_row(i: int, action: str, day: date | None, **kw: Any) -> AuthorityHistory:
    return AuthorityHistory(
        id=i,
        docket_prefix=MC,
        docket_number="139446",
        event_kind=kw.get("event_kind", "STATUS"),
        action=action,
        status=kw.get("status"),
        reason=kw.get("reason"),
        action_date=day,
        source_system=kw.get("source_system", "MOTUS"),
        raw_record_id=100 + i,
    )


def filing(
    i: int,
    start: date,
    end: date | None,
    *,
    insurer: str = "ACME INSURANCE",
    kind: str = "BIPD",
    amount: str | None = "750000",
    status: str | None = None,
    policy: str | None = None,
) -> Insurance:
    on_file = end is None
    return Insurance(
        id=i,
        docket_prefix=MC,
        docket_number="139446",
        insurance_type=kind,
        insurer=insurer,
        coverage_amount=Decimal(amount) if amount else None,
        policy_number=policy or f"P{i}",
        effective_date=start,
        termination_date=end,
        status=status or ("ON_FILE" if on_file else "REPLACED"),
        on_file=on_file,
        raw_record_id=200 + i,
        updated_at=datetime(2026, 10, 1),
    )


ACTIVE = [
    Authority(docket_prefix=MC, docket_number="139446", status="ACTIVE", status_source="LEGACY_LI")
]


def types(events: list[Any]) -> list[tuple[str, date, Severity]]:
    """(type, date, severity) in timeline order."""
    ordered = sorted(events, key=lambda e: (e.event_date, e.event_type))
    return [(e.event_type, e.event_date, e.severity) for e in ordered]


# --- authority ---


def test_real_authority_history_becomes_a_deduplicated_timeline() -> None:
    rows = load_authority_rows()
    history = [
        history_row(
            i,
            e.action,
            e.action_date,
            event_kind=e.event_kind,
            source_system=e.source_system,
            reason=e.reason,
            status=e.status,
        )
        for i, e in enumerate(
            [e for r in rows["9mw4-x3tu"] for e in legacy_events(r)]
            + [e for r in rows["yu5v-wbh6"] for e in motus_events(r)]
        )
    ]

    events = authority_events(history)

    assert types(events) == [
        ("AUTHORITY_GRANTED", date(1986, 7, 18), Severity.INFO),
        ("AUTHORITY_REVOCATION_STARTED", date(2005, 11, 7), Severity.MEDIUM),
        ("AUTHORITY_REVOCATION_DISCONTINUED", date(2005, 11, 29), Severity.INFO),
        ("AUTHORITY_REVOKED", date(2021, 6, 8), Severity.HIGH),
        ("AUTHORITY_REINSTATED", date(2021, 6, 15), Severity.INFO),  # in both systems: once
    ]
    revoked = next(e for e in events if e.event_type == "AUTHORITY_REVOKED")
    assert revoked.title == "Authority revoked (MC139446)"
    assert revoked.raw_record_id is not None


def test_filer_email_is_never_shown() -> None:
    (event,) = authority_events(
        [
            history_row(
                1,
                "WITHDRAWN BY X@EXAMPLE.COM",
                date(2026, 7, 1),
                reason="Withdrawn by x@example.com",
                status="WITHDRAWN",
            )
        ]
    )

    assert event.event_type == "AUTHORITY_WITHDRAWN"
    assert "@" not in event.description
    assert "(filing agent)" in event.description


def test_suspension_and_unknown_actions() -> None:
    events = authority_events(
        [
            history_row(
                1, "INVOLUNTARY SUSPENSION - INSURANCE CANCELLATION EFFECTIVE", date(2026, 3, 1)
            ),
            history_row(2, "SOMETHING NEW", date(2026, 4, 1)),
            history_row(3, "GRANTED", None),  # undated: no timeline position
        ]
    )

    assert types(events) == [
        ("AUTHORITY_SUSPENDED", date(2026, 3, 1), Severity.HIGH),
        ("AUTHORITY_ACTION", date(2026, 4, 1), Severity.INFO),
    ]


# --- insurance ---


def test_renewal_with_the_same_insurer_is_not_a_change() -> None:
    events = insurance_events(
        [
            filing(1, date(2024, 1, 1), date(2025, 1, 1), insurer="Vanliner Insurance Co."),
            filing(2, date(2025, 1, 1), None, insurer="VANLINER INSURANCE CO"),
        ],
        ACTIVE,
        TODAY,
    )

    assert events == []


def test_new_insurer_is_information_not_a_concern() -> None:
    (event,) = insurance_events(
        [
            filing(1, date(2024, 1, 1), date(2025, 1, 1)),
            filing(2, date(2025, 1, 1), None, insurer="OTHER MUTUAL"),
        ],
        ACTIVE,
        TODAY,
    )

    assert (event.event_type, event.event_date, event.severity) == (
        "INSURANCE_INSURER_CHANGED",
        date(2025, 1, 1),
        Severity.INFO,
    )
    assert "not a concern on its own" in event.description


def test_coverage_decrease_and_increase() -> None:
    events = insurance_events(
        [
            filing(1, date(2023, 1, 1), date(2024, 1, 1), amount="1000000"),
            filing(2, date(2024, 1, 1), date(2025, 1, 1), amount="750000"),
            filing(3, date(2025, 1, 1), None, amount="1000000"),
        ],
        ACTIVE,
        TODAY,
    )

    assert types(events) == [
        ("INSURANCE_COVERAGE_CHANGED", date(2024, 1, 1), Severity.LOW),
        ("INSURANCE_COVERAGE_CHANGED", date(2025, 1, 1), Severity.INFO),
    ]
    assert "$1,000,000 to $750,000" in sorted(events, key=lambda e: e.event_date)[0].description


def test_cancellation_with_and_without_a_replacement() -> None:
    replaced = insurance_events(
        [
            filing(1, date(2024, 1, 1), date(2025, 3, 1), status="CANCELLED"),
            filing(2, date(2025, 2, 1), None),
        ],
        ACTIVE,
        TODAY,
    )
    lapsed = insurance_events(
        [
            filing(1, date(2024, 1, 1), date(2025, 3, 1), status="CANCELLED"),
            filing(2, date(2025, 6, 1), None),
        ],
        ACTIVE,
        TODAY,
    )

    cancel = next(e for e in replaced if e.event_type == "INSURANCE_CANCELLED")
    assert cancel.severity == Severity.INFO
    cancel = next(e for e in lapsed if e.event_type == "INSURANCE_CANCELLED")
    assert cancel.severity == Severity.MEDIUM
    (gap,) = [e for e in lapsed if e.event_type == "INSURANCE_GAP"]
    assert (gap.event_date, gap.severity) == (date(2025, 3, 2), Severity.MEDIUM)
    assert "2025-03-02 to 2025-05-31 (91 days)" in gap.description


def test_cargo_gap_is_low_severity() -> None:
    events = insurance_events(
        [
            filing(1, date(2024, 1, 1), date(2024, 6, 1), kind="CARGO", amount=None),
            filing(2, date(2024, 7, 1), None, kind="CARGO", amount=None),
        ],
        ACTIVE,
        TODAY,
    )

    (gap,) = events
    assert (gap.event_type, gap.severity) == ("INSURANCE_GAP", Severity.LOW)


def test_active_authority_with_no_bipd_on_file() -> None:
    filings = [filing(1, date(2024, 1, 1), date(2026, 2, 1), status="CANCELLED")]

    active = insurance_events(filings, ACTIVE, TODAY)
    inactive = insurance_events(
        filings, [Authority(docket_prefix=MC, docket_number="139446", status="INACTIVE")], TODAY
    )
    census_only = insurance_events(
        filings,
        [
            Authority(
                docket_prefix=MC, docket_number="139446", status="ACTIVE", status_source="CENSUS"
            )
        ],
        TODAY,
    )

    assert "INSURANCE_NONE_ON_FILE" in {e.event_type for e in active}
    assert "INSURANCE_NONE_ON_FILE" not in {e.event_type for e in inactive}
    # A census docket status is not an authority status: no claim either way.
    assert "INSURANCE_NONE_ON_FILE" not in {e.event_type for e in census_only}
    none = next(e for e in active if e.event_type == "INSURANCE_NONE_ON_FILE")
    assert (none.event_date, none.severity) == (date(2026, 2, 2), Severity.MEDIUM)


def test_real_insurance_history_has_continuous_coverage() -> None:
    rows = load_insurance_rows()
    values = [v for r in rows["6sqe-dvqs"] if (v := legacy_past(r, date(2026, 5, 14)))] + [
        v for r in rows["c5y8-a4uz"] if (v := motus_current(r, TODAY))
    ]
    filings = [
        Insurance(id=i, raw_record_id=i, updated_at=datetime(2026, 10, 1), **v.__dict__)
        for i, v in enumerate(values)
    ]

    events = insurance_events(filings, ACTIVE, TODAY)

    kinds = {e.event_type for e in events}
    assert "INSURANCE_GAP" not in kinds and "INSURANCE_NONE_ON_FILE" not in kinds
    (cancel,) = [e for e in events if e.event_type == "INSURANCE_CANCELLED"]
    assert (cancel.event_date, cancel.severity) == (date(2003, 4, 17), Severity.INFO)
    # Motus spells the insurer "Vanliner Insurance Company", legacy "VANLINER INSURANCE COMPANY":
    # the same insurer, so the 2025 renewal is not an insurer change.
    assert date(2025, 1, 1) not in {
        e.event_date for e in events if e.event_type == "INSURANCE_INSURER_CHANGED"
    }


def test_two_filings_starting_the_same_day() -> None:
    """Regression: same start date made the gap check compare the records themselves."""
    events = insurance_events(
        [
            filing(1, date(2024, 1, 1), date(2025, 1, 1)),
            filing(2, date(2024, 1, 1), None),
            filing(3, date(2024, 1, 1), date(2024, 6, 1)),
        ],
        ACTIVE,
        TODAY,
    )

    assert "INSURANCE_GAP" not in {e.event_type for e in events}
