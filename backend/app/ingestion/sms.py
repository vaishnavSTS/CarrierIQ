"""Adapter for FMCSA SMS (CSA) results and crash reports by USDOT number.

SMS results: FMCSA's monthly Safety Measurement System summary, one row per carrier, in four
files by carrier type. All carry each BASIC's measure and FMCSA's acute/critical indicator; only
the passenger files carry percentiles and alerts, because the FAST Act (2015) removed property
carriers' percentiles from public view.
- SMS AB Pass (m3ry-qcip), SMS C Pass (h3zn-uid9): passenger carriers, interstate / intrastate.
- SMS AB PassProperty (4y6x-dmck), SMS C PassProperty (h9zy-gjn8): all carriers, interstate /
  intrastate.

Crash File (aayw-vxb3): one row per vehicle in a reported crash, plain USDOT number, report date
as YYYYMMDD text.
"""

from datetime import date

from app.core.config import get_settings
from app.ingestion.company_census import CompanyCensusAdapter
from app.ingestion.socrata_client import Row, SocrataClient

SOURCE = "dot_socrata"
CRASH_YEARS = 5  # crash history fetched


class SmsAdapter:
    source = SOURCE

    def __init__(self, client: SocrataClient) -> None:
        settings = get_settings()
        self.client = client
        # Most specific first: the passenger files carry percentiles.
        self.sms_dataset_ids = self.dataset_ids()
        self.crash_dataset_id = settings.crash_dataset_id

    @staticmethod
    def dataset_ids() -> tuple[str, str, str, str]:
        settings = get_settings()
        return (
            settings.sms_ab_pass_dataset_id,
            settings.sms_c_pass_dataset_id,
            settings.sms_ab_property_dataset_id,
            settings.sms_c_property_dataset_id,
        )

    @staticmethod
    def crash_id() -> str:
        return get_settings().crash_dataset_id

    def fetch_sms(self, dataset_id: str, usdot_number: int) -> list[Row]:
        CompanyCensusAdapter.validate_usdot_number(usdot_number)
        return self.client.get_all_rows(dataset_id, {"dot_number": str(usdot_number)}, ":id")

    def fetch_crashes(self, usdot_number: int, today: date) -> list[Row]:
        CompanyCensusAdapter.validate_usdot_number(usdot_number)
        since = today.replace(year=today.year - CRASH_YEARS, day=min(today.day, 28))
        return self.client.get_all_rows(
            self.crash_dataset_id,
            {
                "dot_number": str(usdot_number),
                "$where": f"report_date >= '{since:%Y%m%d}'",  # digits only: safe
            },
            order="report_date DESC, :id",
        )
