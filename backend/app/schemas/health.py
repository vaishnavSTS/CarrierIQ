from enum import StrEnum

from pydantic import BaseModel


class ComponentStatus(StrEnum):
    OK = "ok"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"


class HealthResponse(BaseModel):
    status: ComponentStatus
    database: ComponentStatus
