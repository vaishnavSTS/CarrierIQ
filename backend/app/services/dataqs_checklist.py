"""Suggested evidence for a DataQs issue, by reason (docs/DataQ.md, Phase 2).

These are STS suggestions to help a carrier gather what usually supports each kind of request
[S3]; they are not a government standard of what is sufficient.
"""

from app.models.enums import DataQsReason

REASON_LABELS: dict[DataQsReason, str] = {
    DataQsReason.WRONG_ATTRIBUTION: "Not our vehicle, driver or company",
    DataQsReason.INACCURATE_VIOLATION: "The violation is inaccurate",
    DataQsReason.DUPLICATE: "Duplicate of another record",
    DataQsReason.FIELD_CORRECTION: "A detail on the report is wrong",
    DataQsReason.COURT_OUTCOME: "Citation dismissed or reduced in court",
    DataQsReason.UNSURE: "Not sure; please review",
}

FULL_REPORT = "The full roadside inspection report"

CHECKLIST: dict[DataQsReason, list[str]] = {
    DataQsReason.WRONG_ATTRIBUTION: [
        FULL_REPORT,
        "Records showing whose vehicle or driver it was that day: lease agreement, bill of "
        "lading, dispatch or trip records",
        "Vehicle registration or driver records for the unit named on the report",
    ],
    DataQsReason.INACCURATE_VIOLATION: [
        FULL_REPORT,
        "Original records from the time of the inspection: ELD / hours-of-service logs, "
        "maintenance or inspection records, photos",
        "Anything that shows the condition cited was not present at the inspection (a later "
        "repair alone does not show this)",
    ],
    DataQsReason.DUPLICATE: [
        FULL_REPORT,
        "The other inspection report the record duplicates",
    ],
    DataQsReason.FIELD_CORRECTION: [
        FULL_REPORT,
        "A document showing the correct value (registration, license, VIN plate photo)",
    ],
    DataQsReason.COURT_OUTCOME: [
        "The citation that relates to this violation",
        "The final court disposition (dismissal, acquittal or reduced charge)",
        FULL_REPORT,
    ],
    DataQsReason.UNSURE: [
        FULL_REPORT,
        "Any records from that day you think are relevant",
    ],
}
