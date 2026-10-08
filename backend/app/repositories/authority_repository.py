"""Database access for authority (one row per docket)."""

from collections.abc import Sequence
from dataclasses import asdict
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ingestion.company_census_normalizer import AuthorityValues
from app.ingestion.operating_authority_normalizer import MOTUS, CurrentAuthorityValues
from app.models import Authority

CENSUS = "CENSUS"


class AuthorityRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    def for_carrier(self, carrier_id: int) -> list[Authority]:
        return list(
            self.db.scalars(
                select(Authority).where(Authority.carrier_id == carrier_id).order_by(Authority.id)
            )
        )

    def sync(
        self,
        carrier_id: int,
        authorities: Sequence[AuthorityValues],
        *,
        source: str,
        raw_record_id: int,
        as_of: date,
    ) -> None:
        """Insert new dockets and update the status of known ones from the census. A status taken
        from Motus is left alone (it is the authority system of record). Never deletes dockets."""
        existing = {(a.docket_prefix, a.docket_number): a for a in self.for_carrier(carrier_id)}
        for values in authorities:
            authority = existing.get((values.docket_prefix, values.docket_number))
            if authority is None:
                self.db.add(
                    Authority(
                        carrier_id=carrier_id,
                        docket_prefix=values.docket_prefix,
                        docket_number=values.docket_number,
                        status=values.status,
                        status_source=CENSUS,
                        status_as_of=as_of,
                        source=source,
                        raw_record_id=raw_record_id,
                    )
                )
            elif authority.status_source != MOTUS:
                if authority.status != values.status:
                    authority.raw_record_id = raw_record_id  # the record the new status came from
                authority.status = values.status
                authority.status_source = CENSUS
                authority.status_as_of = as_of
        self.db.flush()

    def apply_operating_authority(
        self,
        carrier_id: int,
        values: CurrentAuthorityValues,
        *,
        source: str,
        raw_record_id: int,
    ) -> None:
        """Apply FMCSA operating-authority data to a docket (creating it if the census lacks it).

        Motus data overwrites everything. Legacy L&I data (frozen) fills in type and insurance
        requirements unless Motus already supplied them, and sets the status only when no
        fresher status (census or Motus) exists.
        """
        authority = next(
            (
                a
                for a in self.for_carrier(carrier_id)
                if (a.docket_prefix, a.docket_number)
                == (values.docket_prefix, values.docket_number)
            ),
            None,
        )
        if authority is None:
            authority = Authority(
                carrier_id=carrier_id,
                docket_prefix=values.docket_prefix,
                docket_number=values.docket_number,
                source=source,
                raw_record_id=raw_record_id,
            )
            self.db.add(authority)
        is_motus = values.status_source == MOTUS
        if not is_motus and authority.status_source == MOTUS:
            return
        fields = asdict(values)
        for name in ("docket_prefix", "docket_number", "status", "status_source", "status_as_of"):
            fields.pop(name)
        for name, value in fields.items():
            setattr(authority, name, value)
        if is_motus or authority.status is None:
            authority.status = values.status
            authority.status_source = values.status_source
            authority.status_as_of = values.status_as_of
        authority.raw_record_id = raw_record_id
        self.db.flush()

    def for_carriers(self, carrier_ids: Sequence[int]) -> dict[int, list[Authority]]:
        by_carrier: dict[int, list[Authority]] = {carrier_id: [] for carrier_id in carrier_ids}
        if carrier_ids:
            rows = self.db.scalars(
                select(Authority)
                .where(Authority.carrier_id.in_(carrier_ids))
                .order_by(Authority.carrier_id, Authority.id)
            )
            for row in rows:
                by_carrier[row.carrier_id].append(row)
        return by_carrier
