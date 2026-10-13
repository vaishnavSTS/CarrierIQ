"""Create an STS staff account (internal portal). Staff cannot register through the website.

    python -m app.workers.create_staff_user admin@example.com "Full Name"            # STS admin
    python -m app.workers.create_staff_user analyst@example.com "Full Name" analyst  # STS analyst

Asks for the password without echoing it. Creates the STS organization on first use.
"""

import getpass
import sys

from app.core.exceptions import ConflictError
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models import Organization, User
from app.models.enums import OrganizationKind, UserRole, UserStatus
from app.repositories.user_repository import UserRepository
from app.services.auth_service import check_password_strength

ROLES = {"admin": UserRole.STS_ADMIN, "analyst": UserRole.STS_ANALYST}


def create_staff_user(email: str, full_name: str, role: UserRole, password: str) -> User:
    check_password_strength(password)
    with SessionLocal() as db:
        users = UserRepository(db)
        if users.by_email(email) is not None:
            raise ConflictError(f"An account with {email} already exists")
        organization = users.sts_organization()
        if organization is None:
            organization = Organization(name="STS", kind=OrganizationKind.STS)
            db.add(organization)
            db.flush()
        user = User(
            organization_id=organization.id,
            email=email.strip().lower(),
            full_name=full_name.strip(),
            password_hash=hash_password(password),
            role=role,
            status=UserStatus.ACTIVE,
        )
        db.add(user)
        db.commit()
        return user


def main(args: list[str]) -> None:
    if len(args) not in (2, 3) or (len(args) == 3 and args[2] not in ROLES):
        sys.exit(__doc__)
    role = ROLES[args[2]] if len(args) == 3 else UserRole.STS_ADMIN
    password = getpass.getpass("Password: ")
    if password != getpass.getpass("Repeat password: "):
        sys.exit("Passwords do not match")
    user = create_staff_user(args[0], args[1], role, password)
    print(f"Created {user.role.value} {user.email}")


if __name__ == "__main__":
    main(sys.argv[1:])
