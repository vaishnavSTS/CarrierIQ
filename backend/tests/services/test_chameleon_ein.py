"""Chameleon check: the "same EIN" share (pure helpers: no database)."""

from app.schemas.chameleon import ChameleonShareOut
from app.services.chameleon_service import STRENGTH, Linked, apply_ein_matches

EIN = "123456789"


def test_same_ein_adds_a_share_and_counts_as_a_kind() -> None:
    same = Linked(1, shares=[ChameleonShareOut(kind="phone", value="5551234567", past=False)])
    other = Linked(2)
    unknown = Linked(3)

    assert apply_ein_matches(EIN, [same, other, unknown], {1: EIN, 2: "987654321"}) == 1

    assert [s.kind for s in same.shares] == ["phone", "ein"]
    # The EIN is compared, never returned.
    assert same.shares[1].value is None
    assert same.distinct_kinds == 2
    assert other.shares == [] and unknown.shares == []


def test_no_own_ein_no_matches() -> None:
    linked = Linked(1)
    assert apply_ein_matches(None, [linked], {1: EIN}) == 0
    assert linked.shares == []


def test_applied_once() -> None:
    linked = Linked(1)
    apply_ein_matches(EIN, [linked], {1: EIN})
    apply_ein_matches(EIN, [linked], {1: EIN})
    assert [s.kind for s in linked.shares] == ["ein"]


def test_ein_is_the_strongest_detail() -> None:
    assert STRENGTH[0] == "ein"
