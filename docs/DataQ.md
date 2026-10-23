# CarrierSafetyScan: DataQs Build Plan

How we will add DataQs (challenging wrong FMCSA safety records) to CarrierSafetyScan, phase by
phase. Edit freely as decisions are made; record each decision in the log at the bottom.

**Status:** Phase 0 built (2026-10-21): DataQs tab and pages. Phase 1 built (2026-10-21): tables (migration 0024) and access rules. Phase 2 built (2026-10-21): carrier intake wizard, evidence uploads, submit to STS. Phase 3 built (2026-10-21): staff queue, assessment, filing package, carrier approval (migration 0025). Phase 4 built (2026-10-21): manual filing console, receipts, unconfirmed attempts and reconciling (migration 0026). Requests are started from the client DataQs tab. Phase 5 built (2026-10-21): agency correspondence, decisions, appeals, reopenings, deadline clocks with pauses (migration 0027). 2026-10-21: matched to the real DataQs portal (from STS's screen recordings) and emails added (Gmail SMTP, Resend as fallback; migration 0028), see section 7. Phase 6 built: emails and filing reminders; supervisor view and deadline reminders (2026-10-21); outcome verification (2026-10-22, migration 0029).
**Created:** 2026-10-21
**Source:** `../../Sky_DataQs_Developer_Integration.docx` (Sky DataQs Developer Integration Specification v1.0)
**Related:** `client-internal-portal-plan.md`, `../CHECKPOINT.md`

---

## 1. What we are building

A **managed DataQs case service**. A carrier tells STS that a safety record is wrong; STS checks it,
prepares the request, files it with FMCSA's DataQs, and tracks it until the record is corrected (or
the request is closed).

```
Carrier (client portal)          STS staff (internal portal)          Government DataQs
───────────────────────          ───────────────────────────          ─────────────────
Pick inspection / violation  →   Assess the case
Choose reason, explain           Ask for missing evidence  ←→ carrier
Upload evidence                  Build the filing package
Sign authorization           ←   Carrier approves the exact package
                                 File by hand in DataQs            →  Request ID + receipt
                                 Record agency questions,          ←  Info requests, decisions
                                 decisions, appeals
                                 Confirm the record changed        ←  FMCSA data refresh
```

### Who does what

| Who | Portal | Can do |
|---|---|---|
| `CLIENT_ADMIN` | Client | Start cases, upload evidence, sign authorization, approve packages |
| `CLIENT_USER` | Client | View their company's cases only |
| `STS_ANALYST` | Internal | Assess, build packages, file, record correspondence |
| `STS_ADMIN` | Internal | Everything above, plus assign cases, supervisor view, overrides |

### Rules we must follow (from the spec)

- **No government API.** There is no public DataQs filing or status API. Filing is **manual** by an
  STS specialist. Never invent endpoints.
- **Credential storage.** The carrier's account owner may save an FMCSA password with its
  contact details. It is encrypted with Fernet before it reaches the database, never returned by
  the API, and its saved/not-saved status is visible only to that owner. Set
  `DATAQS_CREDENTIAL_ENCRYPTION_KEY` to a securely managed Fernet key before accepting password
  saves; generate one with `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`.
  Keep the key outside the database and back it up securely: replacing it makes existing encrypted
  passwords unrecoverable. MFA secrets and government portal sessions are never stored.
- **No promises.** Say "Potentially eligible for review", never "this will be removed".
- **Tenant isolation.** A client sees only its own organization's cases, files, receipts and
  download links, including in background jobs.
- **Nothing is overwritten.** Every change writes an audit event; reopened cases keep old cycles.
- **Human confirms facts.** AI may draft and summarize; a person confirms every fact and citation.
- **Status moves only on confirmed government events**, never because someone uploaded a file.
- **Release 1:** inspection and violation corrections, plus court-outcome (citation) requests.
  Crash preventability (CPDP) is a separate, later program.

### Government timing rules (baseline)

| Rule | Time |
|---|---|
| Filing window | Inspections 3 years, crashes 5 years from the event date (anniversary, leap-day aware) |
| Agency opens the request | Within 7 days of submission |
| Initial decision | 21 days from submission |
| Reconsideration decision | 21 days from the reconsideration request |
| Final review decision | 45 days from the final review request |
| Carrier appeal | Within 30 days of the prior decision's issue date |
| Carrier answers an info request | Within 14 days |
| Clock basis | Calendar days; an agency info request **pauses** the review clock, the answer resumes it |

Example: review uses 8 days, agency asks a question, carrier answers 5 days later → **13 days**
remain, not a fresh 21.

---

## 2. Naming convention

Everything DataQs is prefixed so it is easy to find:

| Where | Convention | Example |
|---|---|---|
| Backend files | `dataqs_*.py` | `services/dataqs_case_service.py` |
| Database tables | `dataqs_*` | `dataqs_cases`, `dataqs_evidence` |
| Enums | `DataQs*` | `DataQsWorkStatus` |
| API routes | `/dataqs/...` | `GET /api/v1/dataqs/cases` |
| Frontend folder | `features/dataqs/` | `features/dataqs/DataQsCaseRoom.tsx` |
| Frontend components | `DataQs*.tsx` | `DataQsStaffQueue.tsx` |
| Pages | `DataQsPage.tsx`, `PortalDataQsPage.tsx` | |
| Tests | `backend/tests/dataqs/` | `test_dataqs_clock.py` |

---

## 3. Phases at a glance

| Phase | Name | What you can see when it is done |
|---|---|---|
| **0** | Navigation and pages | A **DataQs** tab in the client and STS nav bars, opening an empty DataQs page |
| **1** | Database and permissions | Tables exist; each user only reaches what their role and company allow |
| **2** | Carrier intake and evidence | Carrier opens a case from an inspection, explains it and uploads files |
| **3** | Staff assessment and approval | STS reviews the case, builds a package, the carrier approves it |
| **4** | Manual filing and receipts | STS files in DataQs and records the request ID and receipt |
| **5** | Clocks, correspondence, appeals | Deadlines, paused clocks, agency questions, decisions and appeals |
| **6** | Verification, reminders, reporting | Correction confirmed in FMCSA data; reminders; supervisor view |
| **7** | Pilot and launch | 10 real pilot cases; launch gates pass |

Each phase is usable and tested before the next one starts.

---

## Phase 0: Navigation and pages

**Goal:** a DataQs entry point in both portals. No data yet.

**What gets built**

- STS portal nav: Dashboard · Search · Compare · **DataQs** · Accounts → opens `/dataqs`
  (all STS staff).
- Client portal nav: My carriers · **DataQs** → opens `/portal/dataqs`. This nav row is shown
  always (today it is hidden because client search is off).
- Both pages: heading, short explanation of what DataQs is, "coming soon" state.

**Files**

```
frontend/src/
  pages/DataQsPage.tsx                       new: STS page
  pages/PortalDataQsPage.tsx                 new: client page
  features/dataqs/DataQsIntro.tsx            new: shared "what is DataQs" block
  router.tsx                                 add /dataqs and /portal/dataqs
  components/layout/AppLayout.tsx            add DataQs nav item
  components/layout/PortalLayout.tsx         add My carriers + DataQs nav
```

**Done when:** both tabs show, highlight when active, and open their page; a client cannot open
`/dataqs` and staff cannot open `/portal/dataqs`.

---

## Phase 1: Database and permissions

**Goal:** the data model and the access rules every later phase depends on.

**Tables** (one Alembic migration, `20261021_0024_dataqs_cases.py` or next free number)

| Table | Holds |
|---|---|
| `dataqs_cases` | id, organization_id (tenant), usdot, event (inspection) reference, route, work_status, owner, gov_request_id, row_version |
| `dataqs_issues` | case_id, violation reference, reason code, recorded value, requested value, factual basis, per-issue outcome |
| `dataqs_evidence` | case_id, storage key, SHA-256, original/redacted version, mime type, scan status, uploader, document date, relevance |
| `dataqs_evidence_links` | evidence ↔ issue, with a note on why the file is relevant |
| `dataqs_authorizations` | signer, authority check, scope, terms version, package hash, approved_at, revoked_at |
| `dataqs_packages` | package version, narrative, manifest hash, approved version |
| `dataqs_submission_attempts` | attempt status, filing account identity, receipt, filed_at |
| `dataqs_review_cycles` | level (INITIAL / RECONSIDERATION / FINAL), cycle number, submitted_at, decision_issued_at, outcome, reviewer, parent cycle |
| `dataqs_correspondence` | source, external id, original payload, sent_at, received_at, verified_by |
| `dataqs_clocks` | type, base event, policy version, due_at, confidence, override reason |
| `dataqs_clock_pauses` | clock id, paused_at, resumed_at |
| `dataqs_tasks` | case, assignee, due_at, kind, done_at |
| `dataqs_assessments` | (Phase 3, migration 0025) assessor, checks, outcome, message to the carrier, internal note |
| `dataqs_audit_events` | case, actor, action, before/after values, at (append-only) |
| `dataqs_outbox` | notification events with stable ids, delivery status, retries |

**Status fields** (kept separate, all nullable until known)

- `work_status`: DRAFT, EVIDENCE_NEEDED, STAFF_REVIEW, AWAITING_APPROVAL, READY_TO_FILE,
  SUBMISSION_UNCONFIRMED, MONITORING, VERIFICATION, CLOSED
- `government_raw_status`: exactly what DataQs shows (text)
- `review_level`: INITIAL, RECONSIDERATION, FINAL
- `action_owner`: CARRIER, SKY, AGENCY
- `outcome`: FULL_CORRECTION, PARTIAL_CORRECTION, NO_CORRECTION, PROCEDURAL_CLOSURE, WITHDRAWN

**Permissions**

- Tenant = the client's organization. A client reaches a case only if the case's organization is
  theirs and the USDOT is a **verified** carrier of that organization.
- `CLIENT_USER` is read-only; `CLIENT_ADMIN` can act; staff see all cases.
- Every write checks `row_version` (optimistic concurrency) and appends an audit event in the same
  transaction.

**Files**

```
backend/app/models/dataqs_case.py            DataQsCase, DataQsIssue
backend/app/models/dataqs_evidence.py
backend/app/models/dataqs_authorization.py
backend/app/models/dataqs_package.py         DataQsPackage, DataQsSubmissionAttempt
backend/app/models/dataqs_review_cycle.py
backend/app/models/dataqs_correspondence.py
backend/app/models/dataqs_clock.py           DataQsClock, DataQsClockPause
backend/app/models/dataqs_task.py
backend/app/models/dataqs_audit_event.py
backend/app/models/dataqs_outbox.py
backend/app/models/enums.py                  + DataQsWorkStatus, DataQsReviewLevel, DataQsActionOwner,
                                               DataQsOutcome, DataQsReason
backend/app/repositories/dataqs_case_repository.py
backend/app/services/dataqs_access.py        tenant + role checks used by every route
backend/alembic/versions/20261021_0024_dataqs_cases.py
backend/tests/dataqs/test_dataqs_access.py
```

**Done when:** migration runs on the live DB; tests prove another tenant cannot read a case,
evidence or receipt.

---

## Phase 2: Carrier intake and evidence

**Goal:** a carrier can open a case and upload evidence; STS sees it waiting.

**What gets built**

- **"Request data review"** button on each inspection and violation in the carrier profile's
  Inspections tab. Shows event date, state, report number, review window, data freshness and any
  existing case. Wording: "Potentially eligible for review".
- **Eligibility check:** 3-year window from the inspection date by anniversary (leap-day rule
  documented); STS internal cutoff earlier; unknown dates and anniversary-day cases go to staff
  review; outside the window → "manual assessment", not "not allowed".
- **Intake wizard (7 steps):**
  1. Verify account: verified carrier, USDOT, authorized approver
  2. Select event: inspection, state, report ids, selected violations
  3. Choose reason: wrong carrier, inaccurate violation, duplicate, field correction, court
     outcome, unsure
  4. Explain correction: recorded value, proposed value, factual basis, evidence per issue
  5. Check prior activity: existing DataQs id, prior representative, prior decisions, pending court
  6. Authorize service: signer, scope, consent text version, timestamp
  7. Submit for STS review: case created with owner, missing items, next action
- **Duplicate check** against open cases for the same event, even from another user.
- **Evidence checklist by reason** (suggested, not a government standard): full inspection report;
  original operational records (attribution / HOS); final court disposition + the citation; police
  report (crash).
- **Uploads:** each file linked to an issue with a relevance note; original kept with SHA-256,
  uploader, time, document date, malware scan result; redacted copies are separate versions; type
  and size limits; short-lived download links.

**Files**

```
backend/app/services/dataqs_eligibility.py           review windows, leap days
backend/app/services/dataqs_case_service.py          create, dedupe, status changes
backend/app/services/dataqs_evidence_service.py      upload, hash, scan, link to issue
backend/app/services/dataqs_evidence_storage.py      private file storage (see decision D1)
backend/app/schemas/dataqs.py
backend/app/services/dataqs_checklist.py              suggested evidence by reason
backend/app/api/v1/routes/dataqs.py                  /dataqs/... (staff), /portal/dataqs/... (clients)
  GET  .../carriers/{usdot}/inspections/{id}/check   record, review window, open cases, can_open
  POST /portal/dataqs/carriers/{usdot}/cases         create DRAFT case (Idempotency-Key header)
  POST .../cases/{id}/evidence                       upload (type from content, ≤ 25 MB, SHA-256)
  GET  .../cases/{id}/evidence/{evidence_id}         download (logged in the audit trail)
  POST /portal/dataqs/cases/{id}/submit              sign authorization + submit → STAFF_REVIEW
  GET  .../cases, .../cases/{id}
frontend/src/api/dataqs.ts
frontend/src/hooks/useDataQs.ts
frontend/src/types/dataqs.ts
frontend/src/features/dataqs/RequestDataReviewButton.tsx
frontend/src/features/dataqs/intake/DataQsIntakeWizard.tsx   + one file per step
frontend/src/features/dataqs/DataQsEvidenceUpload.tsx
frontend/src/features/dataqs/DataQsCaseList.tsx             cases list (both portals)
frontend/src/features/dataqs/DataQsCaseRoom.tsx              issues, uploads, missing items, next action
frontend/src/features/dataqs/DataQsSubmitPanel.tsx           authorization + submit
frontend/src/pages/PortalDataQsIntakePage.tsx, DataQsCasePage.tsx
backend/tests/dataqs/test_dataqs_eligibility.py, test_dataqs_intake_api.py
```

**Done when:** a carrier submits a case with evidence; repeated submit does not create two cases;
leap-day and near-anniversary dates are flagged.

---

## Phase 3: Staff assessment and approval

**Goal:** STS reviews a case and the carrier approves an exact package.

**What gets built**

- **Staff queue:** owner, urgency, overdue work, evidence gaps, last government check.
- **Assessment:** assign a specialist; check carrier authority, record identity, request category,
  timing, duplicates, evidence and the state's plan. Outcome is one of: Ready to prepare,
  Evidence needed, Pending external event, Specialist review, Insufficient basis. Reasons the
  carrier sees are stored apart from internal notes.
- **Package:** carrier and representative details, event ids, issue list, requested corrections,
  narrative, evidence index, references; a manifest of exact file versions and hashes.
- **Approval:** carrier approves a specific package hash and scope. Any material edit cancels the
  approval. General service consent (Phase 2) is separate from approval to file this package.

**Files**

```
backend/app/models/dataqs_assessment.py              + migration 20261021_0025_dataqs_assessments.py
backend/app/services/dataqs_assessment_service.py    assign owner, 7 checks + outcome, resubmit
backend/app/services/dataqs_package_service.py       build, freeze, hash, invalidate on edit, approve
  GET  /dataqs/staff                                 staff a case can be assigned to
  POST /dataqs/cases/{id}/owner
  POST /dataqs/cases/{id}/assessments
  POST /dataqs/cases/{id}/packages
  POST /portal/dataqs/cases/{id}/resubmit            carrier: back to STS after adding evidence
  POST /portal/dataqs/cases/{id}/approvals           carrier: approve package id + fingerprint
  POST /portal/dataqs/cases/{id}/package-changes     carrier: ask for changes
frontend/src/features/dataqs/staff/DataQsStaffQueue.tsx
frontend/src/features/dataqs/staff/DataQsOwnerPanel.tsx
frontend/src/features/dataqs/staff/DataQsAssessmentPanel.tsx
frontend/src/features/dataqs/staff/DataQsPackageBuilder.tsx
frontend/src/features/dataqs/DataQsPackageView.tsx
frontend/src/features/dataqs/DataQsPackageReview.tsx      carrier approves here
frontend/src/features/dataqs/DataQsCaseActivity.tsx       open tasks, assessment history
backend/tests/dataqs/test_dataqs_package_approval.py (+ shared conftest.py, helpers.py)
```

**How the states move**

| From | Action | To | Who acts next |
|---|---|---|---|
| STAFF_REVIEW | Assessed: ready to prepare | STAFF_REVIEW | STS (prepare package) |
| STAFF_REVIEW | Assessed: evidence needed | EVIDENCE_NEEDED | Carrier |
| EVIDENCE_NEEDED | Carrier sends it back | STAFF_REVIEW | STS (reassess) |
| STAFF_REVIEW | Assessed: insufficient basis | CLOSED | — |
| STAFF_REVIEW / AWAITING_APPROVAL / READY_TO_FILE | Package built (changed) | AWAITING_APPROVAL | Carrier |
| AWAITING_APPROVAL | Carrier approves package id + fingerprint | READY_TO_FILE | STS (file it, Phase 4) |
| AWAITING_APPROVAL | Carrier asks for changes | STAFF_REVIEW | STS (revise) |

**Done when:** editing an approved package blocks filing until re-approved.

---

## Phase 4: Manual filing and receipts

**Goal:** STS files in DataQs by hand and the app records it correctly.

**What gets built**

- **Submission console:** approved package, attempt history, receipt, duplicate check.
- Specialist signs in to DataQs with **their own** authorized account, enters the approved narrative,
  uploads the approved files, then records: request id, acknowledgement, filing time, assigned
  agency, filing account identity, package version actually submitted.
- Case becomes **Submitted only after the acknowledgement is recorded**. A government draft is not
  a submission.
- Portal timeout → **Submission unconfirmed**; blocks retry until reconciled.
- Reviewing agency comes from the event's jurisdiction, not the carrier's home state.
- **Adapter contract** (manual now; a future approved connector can implement the same):
  `prepare_package(case_id)`, `record_attempt(case_id)`, `confirm_submission(attempt_id, receipt)`,
  `record_correspondence(case_id, source)`, `reconcile(case_id)`.

**Files**

```
backend/app/services/dataqs_filing_adapter.py        FilingAdapter contract + ManualFilingAdapter
backend/alembic/versions/20261021_0026_dataqs_attempt_note.py   attempt `note` column
  POST /dataqs/cases/{id}/submission-attempts                        start (Idempotency-Key)
  POST /dataqs/cases/{id}/submission-attempts/{attempt_id}/confirm   request ID + acknowledgement
  POST /dataqs/cases/{id}/submission-attempts/{attempt_id}/unconfirmed   portal timed out
  POST /dataqs/cases/{id}/submission-attempts/{attempt_id}/abandon   nothing submitted / not found
frontend/src/features/dataqs/staff/DataQsSubmissionConsole.tsx   checklist, filing guide, receipt form
frontend/src/features/dataqs/DataQsFiledCard.tsx                 request ID, filed, agency, stage
backend/tests/dataqs/test_dataqs_filing.py
```

**How filing moves**

| Attempt | Action | Case becomes |
|---|---|---|
| — | Start filing (approved package, no other open attempt) | READY_TO_FILE (attempt STARTED) |
| STARTED | Confirm: request ID, filed time, agency, acknowledgement | MONITORING (agency), INITIAL review cycle, "check it was opened" task due in 7 days |
| STARTED | Portal timed out / not sure | SUBMISSION_UNCONFIRMED: no new attempt, package locked, reconcile task |
| UNCONFIRMED | Found in DataQs → Confirm | MONITORING |
| STARTED / UNCONFIRMED | Nothing submitted / not found → Abandon | READY_TO_FILE (file again) |

**Done when:** repeated confirm does not duplicate acknowledgements; unconfirmed blocks blind retry.

---

## Phase 5: Clocks, correspondence and appeals

**Goal:** every deadline is correct and every agency event is tracked.

**What gets built**

- **Deadline rules engine (versioned):** stores rule version, base event, derived date, source,
  staff adjustments, timezone, confidence. Supervisor confirms overrides.

  | Clock | Starts from |
  |---|---|
  | Initial filing window | Event date anniversary |
  | Initial agency review | Confirmed submission (the 7-day opening check is not extra) |
  | Reconsideration / final | Confirmed request for that stage |
  | Requester information | The agency's information request issue date |
  | Appeal | Prior decision **issue** date (not the date we imported it) |
  | Pause | Confirmed info request → confirmed answer; overlapping pauses counted once |
  | Reopened stage | New cycle with full budget |
  | Internal work | Earlier STS targets, never shown as government rules |

- **Correspondence:** staff record verified agency messages (exact question, dates).
- **Lifecycle events:** info requested (pause + reply task), info supplied (resume), decision
  (keep original response, date, reasons, appeal instructions), partial correction (per issue),
  appeal proposed (new package + approval), appeal filed (new cycle), procedural closure (kept
  apart from a merits denial), reopening (linked new cycle), final review done (normal route
  closed).
- **Reviewer independence:** capture reviewer identities; flag if a reconsideration or final
  reviewer took part earlier.

**Files**

```
backend/app/services/dataqs_clock_service.py         budgets, pauses (merged), due dates, overrides
backend/app/services/dataqs_lifecycle.py             agency events, decisions, appeals, reopenings
backend/alembic/versions/20261021_0027_dataqs_review_cycle_appeals.py   opened_reason, grounds,
                                                     appealed_issue_ids on review cycles
  POST /dataqs/cases/{id}/correspondence             INFO_REQUEST / INFO_RESPONSE / DECISION /
                                                     REOPENING / OTHER (record_correspondence)
  POST /dataqs/cases/{id}/review-requests            propose the next stage (appeal)
  POST /dataqs/cases/{id}/clocks/{clock_id}/override STS admin: set a due date by hand, with reason
  (timeline, tasks, clocks and stages are part of GET /cases/{id}, filtered by role)
frontend/src/features/dataqs/DataQsDeadlines.tsx            active clocks (+ admin override)
frontend/src/features/dataqs/DataQsReviewStages.tsx         every review cycle and its decision
frontend/src/features/dataqs/DataQsTimeline.tsx             what happened, both portals
frontend/src/features/dataqs/staff/DataQsCorrespondencePanel.tsx   record agency events + decisions
frontend/src/features/dataqs/staff/DataQsAppealPanel.tsx    propose reconsideration / final review
backend/tests/dataqs/test_dataqs_clock.py, test_dataqs_lifecycle.py
```

**How the stages move**

| Event (recorded by STS) | Effect |
|---|---|
| Agency asks for information | Agency clock pauses; 14-day answer deadline + task with the exact question |
| STS answered | Agency clock resumes with the time left (8 used + 5 paused → 13 left) |
| Decision: all corrected | VERIFICATION (check FMCSA data, Phase 6) |
| Decision: partly corrected | VERIFICATION for corrected issues; 30-day appeal window for the rest |
| Decision: not corrected | STAFF_REVIEW + 30-day appeal window (from the decision's issue date); after a final review: CLOSED |
| Procedural closure | STAFF_REVIEW, kept apart from a merits denial; no appeal window |
| Reopened (same level / back to initial) | New linked cycle, full review budget; old cycles kept |
| STS proposes an appeal | Cycle "being prepared" → assess → new package → carrier approval → file (Phase 4) |

**Done when:** pause, resume, overlapping pauses, late imported decision, new evidence on appeal and
reopening all pass their tests.

---

## Phase 6: Verification, reminders and reporting

**Goal:** confirm the record actually changed, and nobody misses a deadline.

**What gets built**

- **Outcome verification:** four separate milestones: requested correction → government decision
  → FMCSA record changed → shown in CarrierSafetyScan. Before/after snapshots with observed time.
  "Correction approved, awaiting refresh" until the change is seen (SMS/PSP refresh monthly).
  *Built 2026-10-22* (`dataqs_verification_service.py`, migration 0029): each corrected issue
  waits until FMCSA's Vehicle Inspection File shows it. A thread of the API process re-fetches the
  inspection by id once a day (`DATAQS_VERIFICATION_CHECK_HOURS`, failed looks retried hourly) and
  compares it with the copy kept at intake: a violation no longer listed, or the inspection gone
  from the carrier, is verified automatically; a violation that changed some other way, or an
  inspection missing near the end of the file's three-year window, waits for STS to confirm;
  driver details (not in public data) are always confirmed by STS with proof (PSP report,
  DataQs). Every look is kept, with FMCSA's copy each time it changes. Once verified, the carrier
  is emailed, the carrier's inspections are refreshed (an inspection FMCSA took off the carrier is
  removed) and "shown in CarrierSafetyScan" is marked once our copy matches; when nothing is left
  to confirm STS gets a "close the file" task. Closing before then needs a written reason (kept in
  the audit). Supervisor view: correction not seen 60 days after the decision
  (`DATAQS_VERIFICATION_ESCALATE_DAYS`), corrections to confirm by hand, checks failing 3+ days.
  STS can also "Check FMCSA now" from the case.
- **Tasks and reminders:** in-app tasks immediately; reminders 7/3/1 days before evidence
  deadlines and 14/7/3/1 before appeal deadlines; escalate missing acknowledgements, late
  decisions, uncertain dates and unassigned cases.
  *Built 2026-10-21:* emails to the case owner (or STS admins) 7/3/1 days before an answer to an
  agency information request is due and 14/7/3/1 days before the last day to appeal, rechecked
  when sent (they follow an overridden date, wait while paused, are dropped once the deadline is
  met, stopped or past, and only the most urgent goes after downtime). The escalations are shown
  in the supervisor view rather than emailed.
- **Notifications** via the `dataqs_outbox` and the existing job worker: stable ids, retries,
  no duplicates, delivery status kept.
- **Carrier view** shows the last verified government update time and "awaiting staff
  verification" when relevant.
- **Supervisor view:** unassigned work, deadline exceptions, stale statuses, workload, audit export.
  *Built 2026-10-21* (STS admins: DataQs → Supervisor; `GET /dataqs/supervisor`,
  `GET /dataqs/supervisor/audit.csv`): overdue or near (3 days) answers to the agency and appeals,
  late agency decisions, filing windows passed or closing on unfiled requests, unconfirmed filings,
  unassigned cases, overdue tasks, failed or retrying emails, uncertain dates, and cases with no
  activity for 14 days; workload per specialist; the audit trail as CSV (up to a year at a time).

**Files**

```
backend/app/services/dataqs_verification_service.py
backend/app/services/dataqs_supervisor_service.py    supervisor view + audit export (built)
backend/app/services/dataqs_notifications.py         outbox + reminder schedule
backend/app/jobs/handlers.py                         + DataQs reminder / outbox jobs
frontend/src/features/dataqs/staff/DataQsSupervisorView.tsx   (built)
frontend/src/features/dataqs/DataQsTasks.tsx
backend/tests/dataqs/test_dataqs_verification.py, test_dataqs_notifications.py
```

**Done when:** an approval is never shown as a verified correction before the FMCSA data changes; a
failed email keeps the task and shows the exception to a supervisor.

---

## Phase 7: Pilot and launch

- Rehearse on historical cases; file only genuine, authorized live cases.
- **Pilot 10 cases** with varied reasons.
- **Launch gates:** every submission has authority, an approved package and a receipt; every active
  case has an owner; all date-rule and exception tests pass; data freshness is visible.
- **Measure:** preparation time, evidence completion, response time, overdue work, time to
  verified correction.

---

## 4. Acceptance tests (from the spec)

| Scenario | Must pass |
|---|---|
| Carrier isolation | Another tenant cannot see a case, evidence, receipt or download URL |
| Duplicates and concurrency | Repeated create/confirm does not duplicate work or acknowledgements |
| Approval changed | A material package edit blocks filing under the old approval |
| Submission timeout | Unconfirmed state blocks blind retry until reconciled |
| Boundary timing | Leap dates and near-anniversary cases flagged or calculated by policy |
| Clock pause | Only the eligible interval excluded; overlaps counted once |
| Late imported decision | Appeal clock starts at the original decision issue date |
| New evidence on appeal | Linked initial cycle created; history kept |
| Reopening | Same-level renewal gets a full budget; old cycle kept |
| Partial outcome | Approved and disputed issues stay distinguishable |
| Notification failure | Task persists; retries and supervisor exception visible |
| Refresh lag | Approval not shown as a verified correction before the data changes |

---

## 5. Open decisions

| # | Decision | Needed by | Recommendation |
|---|---|---|---|
| D1 | Where evidence files are stored | Phase 2 | Private Supabase Storage bucket (DB is already on Supabase) |
| D2 | Malware scanning for uploads | Phase 2 | Pick a scanning service before uploads go live |
| D3 | Email provider for reminders | Phase 6 | Needs the background worker running (launch checklist) |
| D4 | Authorization and consent wording | Phase 2 | Legal text from STS, versioned in the app |
| D5 | Retention and deletion policy, legal hold | Before launch | STS policy owner |
| D6 | Representative account setup with DataQs, permitted integration | Phase 4 | Confirm with DataQs support |
| D7 | State plans and exact day counting for launch states | Phase 5 | Get current approved state plans |
| D8 | Fee rules, service owner, escalation coverage | Before launch | STS |

---

## 7. Matching the real DataQs portal, and emails (2026-10-21)

From STS's recordings of the FMCSA Portal and DataQs (see the summary below), the app now
collects what the representative types into DataQs, screen for screen.

**How DataQs filing works (observed):** FMCSA Portal (Login.gov) → the "DataQs Secure Access"
role → DataQs → Start A New Request:

| DataQs step | What it asks | Where our app gets it |
|---|---|---|
| 1 Category | "Crash, Inspection, Investigation, or Audit" | fixed |
| 2 Search for your report | State (required) + one of USDOT#, Report Number, Report Date, Plate | the inspection on the case: the state's report number and unit 1's plate from FMCSA's file (2026-10-22, migrations 0033-0034) |
| 3 Reason (8 tiles) | one reason per request | `DataQsReason` = all 8 tiles (2026-10-22: + "Did not receive a copy or lost the inspection", "Inspection missing from my report"); the package's `dataqs_reason`; the guide lists the violations to choose |
| 4 Request details | "Where did you view the data", "What information should be reviewed and why", files each with a title (25 MB; DataQs's file types) | case `viewed_in`, package narrative, evidence `title` |
| 5 Review | attestation (18 U.S.C. 1001), Submit | carrier's package approval + filer's confirmation carry the attestation |

After filing: request IDs are 7 digits; statuses New → Open - In Review → Closed - (No) Data
Correction Made; history Submitted → Opened (agency, e.g. "NE SP") → Decision Reached;
"Add Response / Documents" answers the agency; **"Re-open Request" is how to appeal** (same ID).

**Emails (Gmail API, or SMTP, or Resend).** The carrier gives the information; an STS representative files it in
DataQs on the carrier's behalf. Emails to the carrier: evidence needed, package ready to approve,
filed (request ID), decision, file closed, plus staff-written messages (kept on the case). Staff
reminders 7 and 21 days after each filing (to the case specialist, or STS admins). Staff close the
file with "File closed" and the carrier is emailed. Sent from an outbox by a thread of the API
once `GMAIL_REFRESH_TOKEN` (or `SMTP_HOST`, or `RESEND_API_KEY`) is set; retries, no duplicates.

---

## 6. Decision log

| Date | Decision | By |
|---|---|---|
| 2026-10-21 | DataQs tab in the client portal and the STS (internal) portal; opens a new DataQs page | User |
| 2026-10-21 | All DataQs code, tables and routes prefixed `dataqs` | User |
| 2026-10-21 | Manual filing only; no DataQs automation until permitted by DataQs | Spec |
| 2026-10-21 | `action_owner` uses `STS` (the spec's `SKY`), matching the rest of the app | Build |
| 2026-10-21 | A case does not point at inspection or violation rows by id (FMCSA refreshes replace them); it keeps a snapshot of the event as opened | Build |
| 2026-10-21 | Client access to a case needs the carrier to be STS-verified for their company; client search never widens DataQs access | Build |
| 2026-10-21 | D1: evidence in the private Supabase bucket `dataqs-evidence`, reached over S3 with storage-only access keys (not the service_role key); files only through the API | User |
| 2026-10-21 | Only the client's account owner opens and submits a case (it needs their signed authorization); staff view all cases and can add evidence | Build |
| 2026-10-21 | Internal filing cutoff: 30 days before the government window ends (`DATAQS_INTERNAL_CUTOFF_DAYS`) | Build |
| 2026-10-21 | Authorization text is a draft (`2026-10-21-draft`) until STS legal wording (D4) | Build |
| 2026-10-21 | Package fingerprint = SHA-256 of the manifest as canonical JSON (includes the narrative's hash and every file's SHA-256); an identical rebuild keeps the package and its approval | Build |
| 2026-10-21 | Package approval text is a draft (`2026-10-21-draft`), separate from the service consent | Build |
| 2026-10-21 | Carriers can ask for changes to a package (not in the spec) so disagreements stay in the case | Build |
| 2026-10-21 | STS targets (not government rules): assess within 3 days, carrier evidence within 14 days, carrier approval within 7 days | Build |
| 2026-10-21 | Clients start requests from the DataQs tab (inspection list per verified carrier), not the Safety tab | User |
| 2026-10-21 | Filing: one open attempt at a time; the package can't change while one is open; a DataQs request ID belongs to one case | Build |
| 2026-10-21 | Carriers see the request ID, filing date and agency; the acknowledgement text, filing account and attempt notes are STS-only | Build |
| 2026-10-21 | Deadlines count calendar days in UTC; a state's own counting rule is applied by an STS admin override with a reason | Build |
| 2026-10-21 | Carriers see the agency's questions, decisions and reasons in their timeline; appeal grounds and reviewer-independence flags are STS-only | Build |
| 2026-10-21 | Carriers can add evidence while the agency reviews (e.g. for an information request) | Build |
| 2026-10-21 | An STS representative files in DataQs on the carrier's behalf; STS emails the carrier about requirements; staff reminders 7 and 21 days after filing; "File closed" emails the carrier | User |
| 2026-10-21 | D3: email through Resend (`RESEND_API_KEY`, `DATAQS_EMAIL_FROM`), replies to Info@ | User |
| 2026-10-21 | D3 changed: email over SMTP through STS's Gmail (Google Workspace) with an App Password (`SMTP_HOST=smtp.gmail.com`, 587, STARTTLS); Resend stays as the fallback | User |
| 2026-10-21 | Carriers' replies go to vaishnav@skytransportsolutions.com (`DATAQS_EMAIL_REPLY_TO`), not Info@ | User |
| 2026-10-21 | Render's free plan blocks outgoing SMTP (OSError on smtp.gmail.com), so emails go through the Gmail API over HTTPS as vaishnav@ (OAuth refresh token, send-only scope, from `python -m app.workers.gmail_authorize`); SMTP and Resend stay as fallbacks | User |
| 2026-10-21 | While testing, every carrier email goes to wesley@ and every STS staff email to vaishnav@ (`DATAQS_EMAIL_CARRIER_OVERRIDE` / `DATAQS_EMAIL_STAFF_OVERRIDE`); clear them to email real recipients | User |
| 2026-10-21 | Reasons, file types and file titles, filing guide, statuses, "Opened" event, appeals by Re-open Request and the attestation match DataQs as recorded | User |
| 2026-10-21 | CSV, ZIP and ETHOS uploads refused (DataQs takes no CSV; ZIP/ETHOS wait for malware scanning) | Build |
| 2026-10-22 | All 8 inspection reasons. A missing inspection is described by the carrier (state, report number, date) since it isn't in FMCSA's data; STS confirms its outcome by hand. A copy request changes no record (nothing to verify). Crash, Investigation and Audit wait for DataQs's screens | User |
| 2026-10-22 | A correction is verified when FMCSA's inspection record changes (checked daily); the monthly CSA recalculation is not waited for. Escalate after 60 days unseen. Driver corrections are confirmed by STS with proof | User |
