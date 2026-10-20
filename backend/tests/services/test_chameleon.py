"""Chameleon check assembly (pure helpers: no database)."""

from datetime import date

from app.schemas.carrier_equipment import EquipmentVehicleOut, VinCarrierOut
from app.schemas.chameleon import ChameleonLinkedOut, ChameleonShareOut
from app.services.chameleon_service import (
    days_after,
    fleet_overlap,
    orders_for,
    prior_revoke,
    sort_key,
    summarize,
)

TODAY = date(2026, 10, 20)


def vehicle(vin: str, kind: str, last_seen: date, shared: bool) -> EquipmentVehicleOut:
    return EquipmentVehicleOut(
        vin=vin,
        inspections=1,
        first_seen=last_seen,
        last_seen=last_seen,
        decoded=True,
        make=None,
        model=None,
        year=None,
        body_class=None,
        vehicle_type=kind,
        gvwr=None,
        check_digit_valid=True,
        other_carriers=(
            [
                VinCarrierOut(
                    usdot_number=1,
                    legal_name=None,
                    inspections=1,
                    first_seen=last_seen,
                    last_seen=last_seen,
                    confidence="MEDIUM",
                )
            ]
            if shared
            else []
        ),
    )


def linked(
    usdot: int, kinds: list[str], vins: int = 0, shutdown: date | None = None
) -> ChameleonLinkedOut:
    shares = [ChameleonShareOut(kind=k, value=None, past=False) for k in kinds]
    return ChameleonLinkedOut(
        usdot_number=usdot,
        legal_name=None,
        status=None,
        registered=None,
        shares=shares,
        distinct_kinds=len({k for k in kinds if k != "building"}),
        shared_vins=vins,
        revocations=[],
        oos_orders=[],
        active_oos_order=False,
        shutdown_date=shutdown,
        days_after_shutdown=days_after(date(2025, 3, 1), shutdown),
        first_linked=None,
    )


def test_fleet_overlap_counts_recent_power_units_only() -> None:
    rows = [
        vehicle("A", "TRUCK", date(2026, 9, 1), shared=True),
        vehicle("B", "TRUCK TRACTOR", date(2026, 1, 1), shared=True),
        vehicle("C", "TRUCK", date(2026, 5, 1), shared=False),
        vehicle("D", "TRAILER", date(2026, 9, 1), shared=True),  # not a power unit
        vehicle("E", "TRUCK", date(2023, 1, 1), shared=True),  # outside 24 months
    ]

    overlap = fleet_overlap(rows, TODAY)

    assert (overlap.power_units_seen, overlap.shared_power_units) == (3, 2)
    assert overlap.percent == 66.7
    assert overlap.over_threshold is True
    assert overlap.window_months == 24


def test_fleet_overlap_without_power_units() -> None:
    overlap = fleet_overlap([], TODAY)

    assert overlap.percent is None and overlap.over_threshold is False


def test_orders_and_days_after_shutdown() -> None:
    orders = orders_for(
        [{"oos_date": "20240110", "status": "ACTIVE"}],
        [{"order1_serve_date": "20250105"}, {"order1_serve_date": "20230101"}],
    )

    assert orders.shutdown_date == date(2025, 1, 5)
    assert orders.active_oos_order is True
    assert days_after(date(2025, 2, 19), orders.shutdown_date) == 45
    assert days_after(date(2020, 1, 1), orders.shutdown_date) < 0  # added before the shutdown
    assert days_after(None, orders.shutdown_date) is None


def test_strongest_links_first() -> None:
    shut = date(2025, 1, 1)
    rows = [
        linked(10, ["phone"], vins=5),
        linked(11, ["building"]),
        linked(12, ["phone", "email"]),
        linked(13, ["phone", "officer"], shutdown=shut),
    ]

    rows.sort(key=sort_key)

    assert [r.usdot_number for r in rows] == [13, 12, 10, 11]


def test_summary_counts() -> None:
    rows = [
        linked(1, ["phone", "duns"], shutdown=date(2025, 1, 1)),  # added 59 days later
        linked(2, ["email"], shutdown=date(2020, 1, 1)),  # more than a year earlier
        linked(3, ["building"]),
    ]

    summary = summarize(rows)

    assert summary.linked_carriers == 3
    assert summary.shut_down == 2
    assert summary.sharing_two_or_more == 1
    assert summary.added_within_year_after_shutdown == 1


def test_prior_revoke() -> None:
    assert (
        prior_revoke(5, {"prior_revoke_flag": "Y", "prior_revoke_dot_number": "77"}).usdot_number
        == 77
    )
    assert (
        prior_revoke(5, {"prior_revoke_flag": "Y", "prior_revoke_dot_number": "5"}).usdot_number
        is None
    )
    assert prior_revoke(5, {}).flagged is False
