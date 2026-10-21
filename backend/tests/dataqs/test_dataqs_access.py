"""Who may see and act on DataQs cases (services/dataqs_access.py): tenant isolation, verified
carriers only, view-only client users, no brokers."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app.core.exceptions import DataQsCaseNotFoundError, DataQsMissingAuthorityError
from app.models import DataQsCase, Organization, OrganizationCarrier, User
from app.models.enums import (
    DataQsEventType,
    DataQsWorkStatus,
    OrganizationKind,
    UserRole,
    UserStatus,
)
from app.repositories.dataqs_case_repository import DataQsCaseRepository
from app.services.dataqs_access import DataQsAccess, may_act, may_view

OWN_USDOT = 1111111
OTHER_USDOT = 2222222


def _user(role: UserRole, organization_id: int = 1, user_id: int = 1) -> User:
    user = User(id=user_id, organization_id=organization_id, email=f"{user_id}@t", full_name="T")
    user.role, user.status = role, UserStatus.ACTIVE
    return user


def _case(organization_id: int = 1, usdot_number: int = OWN_USDOT) -> DataQsCase:
    return DataQsCase(organization_id=organization_id, usdot_number=usdot_number)


# --- Pure rules (no database) --------------------------------------------------------------------


@pytest.mark.parametrize("role", [UserRole.STS_ADMIN, UserRole.STS_ANALYST])
def test_staff_see_and_act_on_every_case(role: UserRole) -> None:
    staff, case = _user(role, organization_id=99), _case()
    assert may_view(staff, case, set())
    assert may_act(staff, case, set())


def test_client_owner_sees_and_acts_on_own_verified_carrier() -> None:
    owner = _user(UserRole.CLIENT_ADMIN)
    assert may_view(owner, _case(), {OWN_USDOT})
    assert may_act(owner, _case(), {OWN_USDOT})


def test_client_viewer_sees_but_cannot_act() -> None:
    viewer = _user(UserRole.CLIENT_USER)
    assert may_view(viewer, _case(), {OWN_USDOT})
    assert not may_act(viewer, _case(), {OWN_USDOT})


def test_client_never_sees_another_company_case() -> None:
    owner = _user(UserRole.CLIENT_ADMIN, organization_id=1)
    other_company = _case(organization_id=2)
    assert not may_view(owner, other_company, {OWN_USDOT})
    assert not may_act(owner, other_company, {OWN_USDOT})


def test_client_loses_access_when_carrier_is_not_verified() -> None:
    owner = _user(UserRole.CLIENT_ADMIN)
    assert not may_view(owner, _case(), set())


@pytest.mark.parametrize("role", [UserRole.BROKER_ADMIN, UserRole.BROKER_USER])
def test_brokers_have_no_dataqs_access(role: UserRole) -> None:
    broker = _user(role)
    assert not may_view(broker, _case(), {OWN_USDOT})
    assert not may_act(broker, _case(), {OWN_USDOT})


# --- With the database ---------------------------------------------------------------------------


def _organization(db: Session, kind: OrganizationKind, name: str) -> Organization:
    organization = Organization(name=name, kind=kind)
    db.add(organization)
    db.flush()
    return organization


def _db_user(db: Session, organization: Organization, role: UserRole, email: str) -> User:
    user = User(
        organization_id=organization.id,
        email=email,
        full_name="Someone",
        role=role,
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    db.flush()
    return user


def _link(db: Session, organization: Organization, usdot: int, *, verified: bool) -> None:
    db.add(
        OrganizationCarrier(organization_id=organization.id, usdot_number=usdot, verified=verified)
    )
    db.flush()


def _db_case(
    db: Session, organization: Organization, usdot: int, by: User, key: str | None = None
) -> DataQsCase:
    case = DataQsCase(
        organization_id=organization.id,
        usdot_number=usdot,
        event_type=DataQsEventType.INSPECTION,
        source_event_id=f"INSP-{usdot}",
        source_snapshot={"inspection_id": f"INSP-{usdot}"},
        created_by_id=by.id,
        idempotency_key=key,
    )
    db.add(case)
    db.flush()
    return case


@pytest.fixture
def world(db: Session) -> dict[str, object]:
    """Two client companies with a verified carrier each, one unverified carrier, STS and a
    brokerage."""
    acme = _organization(db, OrganizationKind.CLIENT, "Acme")
    other = _organization(db, OrganizationKind.CLIENT, "Other Co")
    sts = _organization(db, OrganizationKind.STS, "STS")
    brokerage = _organization(db, OrganizationKind.BROKER, "Brokerage")
    _link(db, acme, OWN_USDOT, verified=True)
    _link(db, acme, 3333333, verified=False)
    _link(db, other, OTHER_USDOT, verified=True)
    users = {
        "owner": _db_user(db, acme, UserRole.CLIENT_ADMIN, "owner@acme.test"),
        "viewer": _db_user(db, acme, UserRole.CLIENT_USER, "viewer@acme.test"),
        "other_owner": _db_user(db, other, UserRole.CLIENT_ADMIN, "owner@other.test"),
        "staff": _db_user(db, sts, UserRole.STS_ANALYST, "analyst@sts.test"),
        "broker": _db_user(db, brokerage, UserRole.BROKER_ADMIN, "broker@b.test"),
    }
    owner, other_owner = users["owner"], users["other_owner"]
    return {
        **users,
        "acme": acme,
        "other": other,
        "own_case": _db_case(db, acme, OWN_USDOT, owner),
        "unverified_case": _db_case(db, acme, 3333333, owner),
        "other_case": _db_case(db, other, OTHER_USDOT, other_owner),
    }


def test_each_user_lists_only_the_cases_they_may_see(db: Session, world: dict) -> None:
    access = DataQsAccess(db)
    own, unverified, other = world["own_case"], world["unverified_case"], world["other_case"]

    assert access.visible_cases(world["owner"]) == [own]
    assert access.visible_cases(world["viewer"]) == [own]
    assert access.visible_cases(world["other_owner"]) == [other]
    assert set(access.visible_cases(world["staff"])) == {own, unverified, other}
    assert access.visible_cases(world["broker"]) == []


def test_another_company_case_answers_not_found(db: Session, world: dict) -> None:
    access = DataQsAccess(db)
    with pytest.raises(DataQsCaseNotFoundError):
        access.case_to_view(world["owner"], world["other_case"].id)
    with pytest.raises(DataQsCaseNotFoundError):
        access.case_to_view(world["owner"], 987654321)  # does not exist: the same answer
    assert access.case_to_view(world["staff"], world["other_case"].id) is world["other_case"]


def test_viewer_cannot_act_and_owner_can(db: Session, world: dict) -> None:
    access = DataQsAccess(db)
    case_id = world["own_case"].id
    with pytest.raises(DataQsMissingAuthorityError):
        access.case_to_act_on(world["viewer"], case_id)
    assert access.case_to_act_on(world["owner"], case_id) is world["own_case"]


def test_who_may_open_a_case(db: Session, world: dict) -> None:
    access = DataQsAccess(db)
    acme, other = world["acme"].id, world["other"].id

    access.ensure_can_open_case(world["owner"], acme, OWN_USDOT)
    access.ensure_can_open_case(world["staff"], acme, OWN_USDOT)  # on the client's behalf
    for user, organization_id, usdot in (
        (world["owner"], acme, 3333333),  # carrier not verified
        (world["owner"], other, OTHER_USDOT),  # another company
        (world["viewer"], acme, OWN_USDOT),  # view-only user
        (world["staff"], acme, 3333333),  # staff still need a verified carrier
        (world["broker"], acme, OWN_USDOT),
    ):
        with pytest.raises(DataQsMissingAuthorityError):
            access.ensure_can_open_case(user, organization_id, usdot)


def test_audit_event_is_appended_with_the_case_version(db: Session, world: dict) -> None:
    repository = DataQsCaseRepository(db)
    case = world["own_case"]
    repository.audit(case, world["owner"], "case.created", after={"work_status": "DRAFT"})
    case.work_status = DataQsWorkStatus.STAFF_REVIEW
    db.flush()
    repository.audit(
        case,
        world["staff"],
        "work_status.changed",
        before={"work_status": "DRAFT"},
        after={"work_status": "STAFF_REVIEW"},
    )

    events = repository.audit_events(case.id)
    assert [(e.action, e.case_row_version) for e in events] == [
        ("case.created", 1),
        ("work_status.changed", 2),
    ]
    assert events[1].actor_id == world["staff"].id


def test_a_write_based_on_a_stale_read_fails(db: Session, world: dict) -> None:
    case = world["own_case"]
    # Someone else saved a change after we read the case.
    db.execute(
        text("UPDATE dataqs_cases SET row_version = row_version + 1 WHERE id = :id"),
        {"id": case.id},
    )
    case.work_status = DataQsWorkStatus.EVIDENCE_NEEDED
    with pytest.raises(StaleDataError):
        db.flush()
    db.rollback()


def test_repeated_create_with_the_same_key_is_rejected(db: Session, world: dict) -> None:
    acme, owner = world["acme"], world["owner"]
    _db_case(db, acme, OWN_USDOT, owner, key="intake-1")
    with pytest.raises(IntegrityError), db.begin_nested():
        _db_case(db, acme, OWN_USDOT, owner, key="intake-1")
