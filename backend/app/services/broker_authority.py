"""Does an MC or USDOT number hold active FMCSA broker authority? Checked live at broker sign-up.

Motus (FMCSA's current registration system) decides when it lists broker authority for the
number; otherwise legacy L&I (frozen on its last refresh, 2026-05-14) does, the same precedence
as the Authority tab. Motus writes dockets unpadded ("MC1234"), legacy pads them ("MC001234");
both forms are asked for.
"""

from dataclasses import dataclass
from typing import Literal

from app.core.config import get_settings
from app.core.exceptions import ValidationError
from app.ingestion.operating_authority_normalizer import LEGACY, MOTUS, parse_docket
from app.ingestion.socrata_client import Row, SocrataClient

IdKind = Literal["MC", "USDOT"]


@dataclass(frozen=True)
class BrokerAuthority:
    usdot_number: int | None
    docket_number: str | None  # "MC261603"
    legal_name: str | None
    source: str  # MOTUS | LEGACY_LI


class BrokerAuthorityChecker:
    def __init__(self, client: SocrataClient) -> None:
        self.client = client
        settings = get_settings()
        self.motus_dataset_id = settings.motus_carrier_dataset_id
        self.legacy_dataset_id = settings.legacy_carrier_dataset_id

    def check(self, kind: IdKind, number: int) -> BrokerAuthority:
        """The brokerage behind the number; ValidationError (shown on the sign-up form) when it
        has no active broker authority."""
        label = f"MC {number}" if kind == "MC" else f"USDOT {number}"

        motus = [r for r in self._motus(kind, number) if _is_broker(r.get("op_auth_type"))]
        active = [r for r in motus if str(r.get("op_auth_status", "")).upper() == "ACTIVE"]
        if active:
            row = active[0]
            return BrokerAuthority(
                _int(row.get("usdot_number")),
                _docket(row.get("docket_number")),
                row.get("legal_name"),
                MOTUS,
            )
        if motus:
            status = str(motus[0].get("op_auth_status") or "not active").lower()
            raise ValidationError(f"FMCSA shows the broker authority for {label} as {status}")

        legacy = [r for r in self._legacy(kind, number) if r.get("broker_stat") in ("A", "I")]
        current = [r for r in legacy if r.get("broker_stat") == "A"]
        if current:
            row = current[0]
            return BrokerAuthority(
                _int(row.get("dot_number")),
                _docket(row.get("docket_number")),
                row.get("legal_name"),
                LEGACY,
            )
        if legacy:
            raise ValidationError(f"FMCSA shows the broker authority for {label} as inactive")
        raise ValidationError(
            f"FMCSA has no broker authority for {label}. Check the number, or use your "
            "brokerage's MC number."
        )

    def _motus(self, kind: IdKind, number: int) -> list[Row]:
        where = (
            f"docket_number in ('MC{number}', 'MC{number:06d}')"
            if kind == "MC"
            else f"usdot_number = '{number}'"
        )
        return self.client.get_rows(self.motus_dataset_id, {"$where": where, "$limit": "50"})

    def _legacy(self, kind: IdKind, number: int) -> list[Row]:
        where = (
            f"docket_number in ('MC{number}', 'MC{number:06d}')"
            if kind == "MC"
            else f"dot_number = '{number:08d}'"
        )
        return self.client.get_rows(self.legacy_dataset_id, {"$where": where, "$limit": "50"})


def _is_broker(authority_type: object) -> bool:
    return str(authority_type or "").lower().startswith("broker")


def _int(value: object) -> int | None:
    try:
        return int(str(value))
    except ValueError:
        return None


def _docket(value: object) -> str | None:
    parsed = parse_docket(str(value or ""))
    return f"{parsed[0].value}{parsed[1]}" if parsed else None
