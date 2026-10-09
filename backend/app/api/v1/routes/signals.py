from typing import Annotated

from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.signal_repository import SignalRepository
from app.schemas.carrier_signals import SignalOut, SignalReviewIn
from app.services.carrier_signals_service import SignalReviewService

router = APIRouter(prefix="/signals", tags=["signals"])


def get_signal_review_service(db: Annotated[Session, Depends(get_db)]) -> SignalReviewService:
    return SignalReviewService(db, SignalRepository(db))


@router.patch("/{signal_id}", response_model=SignalOut)
def review_signal(
    signal_id: Annotated[int, Path(gt=0)],
    decision: SignalReviewIn,
    service: Annotated[SignalReviewService, Depends(get_signal_review_service)],
) -> SignalOut:
    """Mark a signal REVIEWED or DISMISSED (with an optional note), or reopen it."""
    return service.review(signal_id, decision)
