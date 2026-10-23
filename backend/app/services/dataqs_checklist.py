"""DataQs reasons, as DataQs words them, and suggested evidence for each (docs/DataQ.md).

`DATAQS_REASON` is the exact text of DataQs's step 3 ("Choose the reason for your request") for an
inspection report, all eight tiles, so the STS representative picks the same tile when filing.
Two aren't corrections of a record already on file: a copy request ("Did not receive a copy or
lost the inspection") and "Inspection missing from my report", which the carrier describes
because it isn't in FMCSA's data. Both are about the whole inspection (WHOLE_INSPECTION_ONLY).

The checklists are STS suggestions [S3], not a government standard of what is sufficient. DataQs
does not review a request until supporting documents are attached.
"""

from app.models.enums import DataQsReason

# What the carrier sees in the intake wizard.
REASON_LABELS: dict[DataQsReason, str] = {
    DataQsReason.CITATION_OUTCOME: "A citation for a violation was dismissed or reduced in court",
    DataQsReason.VIOLATION_INCORRECT: (
        "A violation is incorrect, listed more than once, or missing equipment provider/shipper"
    ),
    DataQsReason.WRONG_CARRIER: "Our company or USDOT number is listed by mistake",
    DataQsReason.DRIVER_INCORRECT: "The driver's name or license number is wrong",
    DataQsReason.DUPLICATE_INSPECTION: "The same inspection is listed more than once",
    DataQsReason.INCORRECT_INFORMATION: (
        "Other information on the report is wrong (e.g. inspection level or location)"
    ),
    DataQsReason.COPY_REQUEST: "We didn't get a copy of the inspection report, or lost it",
    DataQsReason.MISSING_INSPECTION: "An inspection is missing from our record",
    DataQsReason.UNSURE: "Not sure; please review",
}

# Reasons about the whole inspection, never one violation.
WHOLE_INSPECTION_ONLY = {DataQsReason.COPY_REQUEST, DataQsReason.MISSING_INSPECTION}

# Exactly as DataQs shows it (step 3), for the representative filing the request.
DATAQS_REASON: dict[DataQsReason, str] = {
    DataQsReason.CITATION_OUTCOME: "Citation associated with violation on an inspection",
    DataQsReason.VIOLATION_INCORRECT: (
        "Violation is incorrect, listed multiple times, or missing Intermodal Equipment Provider "
        "(IEP)/shipper information"
    ),
    DataQsReason.WRONG_CARRIER: (
        "Company and/or USDOT Number is listed incorrectly on the inspection report"
    ),
    DataQsReason.DRIVER_INCORRECT: (
        "Driver name and/or license number is listed incorrectly on the inspection report"
    ),
    DataQsReason.DUPLICATE_INSPECTION: "Duplicate (same inspection listed multiple times)",
    DataQsReason.INCORRECT_INFORMATION: "Inspection report contains incorrect information / Other",
    DataQsReason.COPY_REQUEST: "Did not receive a copy or lost the inspection",
    DataQsReason.MISSING_INSPECTION: "Inspection missing from my report",
}

FULL_REPORT = "The full roadside inspection report"

CHECKLIST: dict[DataQsReason, list[str]] = {
    DataQsReason.CITATION_OUTCOME: [
        "The citation that relates to this violation",
        "The final court disposition (dismissal, acquittal or reduced charge)",
        FULL_REPORT,
    ],
    DataQsReason.VIOLATION_INCORRECT: [
        FULL_REPORT,
        "Original records from the time of the inspection: ELD / hours-of-service logs, "
        "maintenance or inspection records, photos",
        "Anything that shows the condition cited was not present at the inspection (a later "
        "repair alone does not show this)",
    ],
    DataQsReason.WRONG_CARRIER: [
        FULL_REPORT,
        "Records showing whose vehicle or driver it was that day: lease agreement, bill of "
        "lading, dispatch or trip records",
        "Vehicle registration for the unit named on the report",
    ],
    DataQsReason.DRIVER_INCORRECT: [
        FULL_REPORT,
        "The driver's license (front) or driver records showing the correct name and number",
    ],
    DataQsReason.DUPLICATE_INSPECTION: [
        FULL_REPORT,
        "The other inspection report it duplicates",
    ],
    DataQsReason.INCORRECT_INFORMATION: [
        FULL_REPORT,
        "A document showing the correct value (e.g. the paper inspection report, registration)",
    ],
    DataQsReason.COPY_REQUEST: [
        "Anything that identifies the inspection: the date, state and location, the report number "
        "if you have it, and the vehicle or driver inspected",
    ],
    DataQsReason.MISSING_INSPECTION: [
        "Your copy of the inspection report (from the officer, or a photo of it)",
        "Records showing the vehicle and driver ran for your company that day: bill of lading, "
        "dispatch or trip records, ELD logs",
    ],
    DataQsReason.UNSURE: [
        FULL_REPORT,
        "Any records from that day you think are relevant",
    ],
}

# DataQs asks a brief title for each file ("or select a suggested title"). Suggestions of ours;
# "Other evidence to support RDR" is one DataQs itself uses.
DOCUMENT_TITLES = [
    "Inspection report",
    "Citation",
    "Court disposition",
    "ELD / hours-of-service records",
    "Maintenance records",
    "Lease agreement",
    "Bill of lading",
    "Driver's license",
    "Vehicle registration",
    "Photos",
    "Other evidence to support RDR",
]

# DataQs step 4: "Where did you view the data you want reviewed?" "A&I/SMS Results" is the option
# seen in DataQs; the others are what carriers usually look at (confirm against DataQs's list).
VIEWED_IN_OPTIONS = [
    "A&I/SMS Results",
    "Pre-Employment Screening Program (PSP) report",
    "FMCSA Portal",
    "Roadside inspection report",
    "Other",
]
