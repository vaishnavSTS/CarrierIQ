from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.dashboard import DashboardOut
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardOut)
def get_dashboard(db: Annotated[Session, Depends(get_db)]) -> DashboardOut:
    """Totals across loaded carriers and the newest signals (stored data only)."""
    return DashboardService(db).overview()
