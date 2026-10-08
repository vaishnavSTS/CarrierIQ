"""Insurance filing rows (Motus and legacy L&I, current and past) -> canonical values. Pure.

Codes follow the USDOT Motus Operating Authority Data Dictionary (as of 2026-05-18). Observed
on 2026-10-08 against the same policy in both systems: Motus amounts are in dollars, legacy
amounts in thousands; Motus form codes carry a "BMC-" prefix that legacy codes do not.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any

from app.ingestion.fmcsa_values import dollars, mdy, text, thousands, upper, yyyymmdd
from app.ingestion.operating_authority_normalizer import LEGACY, MOTUS, parse_docket
from app.models.enums import DocketPrefix

Row = dict[str, Any]

# INS_TYPE_CODE
TYPE_CODES = {"1": "BIPD", "2": "CARGO", "3": "BOND", "4": "TRUST_FUND"}
# INS_FORM_CODE, used when no type code is given (legacy history)
FORM_TYPES = {
    "91": "BIPD",
    "91X": "BIPD",
    "82": "BIPD",
    "34": "CARGO",
    "83": "CARGO",
    "84": "BOND",
    "85": "TRUST_FUND",
}
# Legacy CANCL_METHOD_GEN / Motus FILING_STATUS_REASON
CANCELLATION_STATUS = {
    "CANCELLED": "CANCELLED",
    "CANCEL": "CANCELLED",
    "REPLACED": "REPLACED",
    "TERM/REPL": "REPLACED",
    "NAME CHANGED": "NAME_CHANGED",
    "NAMECHG": "NAME_CHANGED",
    "TRANSFERRED": "TRANSFERRED",
}
ON_FILE = "ON_FILE"


@dataclass(frozen=True)
class InsuranceValues:
    docket_prefix: DocketPrefix
    docket_number: str
    insurer: str | None
    insurance_type: str | None
    insurance_class: str | None
    form_code: str | None
    coverage_amount: Decimal | None  # dollars
    underlying_limit: Decimal | None  # dollars
    policy_number: str | None
    effective_date: date | None
    termination_date: date | None
    status: str  # ON_FILE | CANCELLED | REPLACED | NAME_CHANGED | TRANSFERRED | the raw reason
    on_file: bool
    received_date: date | None
    source_system: str
    status_as_of: date | None

    def identity(self) -> tuple[object, ...]:
        """Same filing across systems and refreshes: docket, type, policy and its dates."""
        return (
            self.docket_prefix,
            self.docket_number,
            self.insurance_type,
            (self.policy_number or "").replace(" ", "").upper(),
            self.effective_date,
            self.termination_date,
        )


def motus_current(row: Row, as_of: date) -> InsuranceValues | None:
    return _motus(row, as_of, current=True)


def motus_past(row: Row, as_of: date) -> InsuranceValues | None:
    return _motus(row, as_of, current=False)


def legacy_current(row: Row, frozen_on: date) -> InsuranceValues | None:
    docket = parse_docket(row.get("prefix_docket_number"))
    if docket is None:
        return None
    form = _form(row)
    kind = _type(row, form)
    return InsuranceValues(
        docket_prefix=docket[0],
        docket_number=docket[1],
        insurer=text(row, "name_company"),
        insurance_type=kind,
        insurance_class=upper(row, "ins_class_code"),
        form_code=form,
        coverage_amount=_amount(thousands(row, "max_cov_amount")),
        underlying_limit=_amount(thousands(row, "underl_lim_amount")),
        policy_number=text(row, "policy_no"),
        effective_date=mdy(row, "effective_date"),
        termination_date=None,
        status=ON_FILE,
        on_file=True,
        received_date=None,
        source_system=LEGACY,
        status_as_of=frozen_on,
    )


def legacy_past(row: Row, frozen_on: date) -> InsuranceValues | None:
    docket = parse_docket(row.get("docket_number"))
    if docket is None:
        return None
    form = _form(row)
    kind = FORM_TYPES.get(form or "") or _type_from_description(upper(row, "mod_col_3"))
    method = upper(row, "mod_col_1")  # CANCL_METHOD_GEN
    return InsuranceValues(
        docket_prefix=docket[0],
        docket_number=docket[1],
        insurer=text(row, "name_company"),
        insurance_type=kind,
        insurance_class=upper(row, "ins_class_code"),
        form_code=form,
        coverage_amount=_amount(thousands(row, "mod_col_5")),  # MAX_COV_AMOUNT
        underlying_limit=_amount(thousands(row, "mod_col_4")),  # UNDERL_LIM_AMOUNT
        policy_number=text(row, "policy_no"),
        effective_date=mdy(row, "effective_date"),
        termination_date=mdy(row, "cancl_effective_date"),
        status=CANCELLATION_STATUS.get(method or "", method or "CANCELLED"),
        on_file=False,
        received_date=None,
        source_system=LEGACY,
        status_as_of=frozen_on,
    )


def _motus(row: Row, as_of: date, *, current: bool) -> InsuranceValues | None:
    docket = parse_docket(row.get("docket_number"))
    if docket is None:
        return None
    form = _form(row)
    kind = _type(row, form)
    reason = upper(row, "filing_status_reason")
    return InsuranceValues(
        docket_prefix=docket[0],
        docket_number=docket[1],
        insurer=text(row, "insurance_company_name"),
        insurance_type=kind,
        insurance_class=upper(row, "ins_class_code"),
        form_code=form,
        coverage_amount=_amount(dollars(row, "max_cov_amount")),
        underlying_limit=_amount(dollars(row, "underl_lim_amount")),
        policy_number=text(row, "policy_no"),
        effective_date=yyyymmdd(row, "effective_date"),
        termination_date=None if current else yyyymmdd(row, "cancl_effective_date"),
        status=ON_FILE if current else CANCELLATION_STATUS.get(reason or "", reason or "CANCELLED"),
        on_file=current,
        received_date=yyyymmdd(row, "trans_date"),
        source_system=MOTUS,
        status_as_of=as_of,
    )


def _form(row: Row) -> str | None:
    form = upper(row, "ins_form_code")
    return form.removeprefix("BMC-") if form else None


def _type(row: Row, form: str | None) -> str | None:
    return TYPE_CODES.get(text(row, "ins_type_code") or "") or FORM_TYPES.get(form or "")


def _type_from_description(description: str | None) -> str | None:
    """Legacy INS_TYPE_DESC, e.g. "BIPD/Primary", "CARGO", "SURETY"."""
    if not description:
        return None
    if description.startswith("BIPD"):
        return "BIPD"
    if description.startswith("CARGO"):
        return "CARGO"
    if description.startswith("SURETY"):
        return "BOND"
    if "TRUST" in description:
        return "TRUST_FUND"
    return None


def _amount(value: Decimal | None) -> Decimal | None:
    """Zero means "no amount given": the dictionary says non-BI&PD filings carry 0 amounts."""
    if value is None or value == 0:
        return None
    return value
