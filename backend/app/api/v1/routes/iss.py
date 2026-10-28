"""STS's High ISS list: carriers at or above an Estimated ISS threshold, and as an Excel file."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.high_iss import HighIssOut
from app.services.high_iss_service import high_iss, high_iss_xlsx

router = APIRouter(prefix="/iss", tags=["iss"])

Db = Annotated[Session, Depends(get_db)]
MinScore = Annotated[int, Query(ge=1, le=100)]
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/high", response_model=HighIssOut)
def high(db: Db, min_score: MinScore = 75) -> HighIssOut:
    """Carriers whose latest Estimated ISS is at least `min_score`, worst first."""
    return high_iss(db, min_score)


@router.get("/high.xlsx")
def high_excel(db: Db, min_score: MinScore = 75) -> Response:
    """The same list as an Excel file."""
    data = high_iss_xlsx(high_iss(db, min_score))
    name = f"high-iss-{min_score}-plus-{date.today():%Y-%m-%d}.xlsx"
    return Response(
        content=data,
        media_type=XLSX,
        headers={
            "Content-Disposition": f'attachment; filename="{name}"',
            "Cache-Control": "private, no-store",
        },
    )
