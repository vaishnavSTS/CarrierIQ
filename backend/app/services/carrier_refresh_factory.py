"""Assembles the full carrier refresh: census, detail sources and post-refresh steps.

Used by the API (on-demand refresh) and the background worker (scheduled refresh).
"""

from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.ingestion.socrata_client import SocrataClient
from app.ingestion.vpic import VpicClient
from app.repositories.carrier_repository import CarrierRepository
from app.services.authority_ingestion_service import build_authority_ingestion_service
from app.services.carrier_refresh_service import CarrierRefreshService
from app.services.census_ingestion_service import build_census_ingestion_service
from app.services.inspection_ingestion_service import build_inspection_ingestion_service
from app.services.insurance_ingestion_service import build_insurance_ingestion_service
from app.services.shared_vin_service import build_shared_vin_service
from app.services.signal_service import build_signal_service
from app.services.timeline_service import build_timeline_service
from app.services.vehicle_observation_service import build_vehicle_observation_service
from app.services.vin_decode_service import build_vin_decode_service


def build_refresh_service(
    db: Session, client: SocrataClient, vpic: VpicClient
) -> CarrierRefreshService:
    return CarrierRefreshService(
        CarrierRepository(db),
        build_census_ingestion_service(db, client),
        [
            build_inspection_ingestion_service(db, client),
            # After inspections: checks this carrier's VINs against all FMCSA inspections.
            build_shared_vin_service(db, client),
            build_authority_ingestion_service(db, client),
            # After authority: uses its dockets to look up legacy insurance filings.
            build_insurance_ingestion_service(db, client),
        ],
        max_age=timedelta(hours=get_settings().carrier_refresh_hours),
        after_refresh=[
            build_vehicle_observation_service(db).rebuild_own,
            build_vin_decode_service(db, vpic).decode_for_carrier,
            build_timeline_service(db).rebuild,
            # Last: rules read everything loaded above.
            build_signal_service(db).rebuild,
        ],
    )
