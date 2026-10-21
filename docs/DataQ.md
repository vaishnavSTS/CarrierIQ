# CarrierSafetyScan: DataQs Build Plan

How we will add DataQs (challenging wrong FMCSA safety records) to CarrierSafetyScan, phase by
phase. Edit freely as decisions are made; record each decision in the log at the bottom.

**Status:** Planning. Nothing built yet.
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
- **Never store** Login.gov passwords, MFA secrets or government portal sessions.
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
| `dataqs_evidence` | case_id, issue links, storage key, SHA-256, original/redacted version, mime type, scan status, uploader, document date, relevance |
| `dataqs_authorizations` | signer, authority check, scope, terms version, package hash, approved_at, revoked_at |
| `dataqs_packages` | package version, narrative, manifest hash, approved version |
| `dataqs_submission_attempts` | attempt status, filing account identity, receipt, filed_at |
| `dataqs_review_cycles` | level (INITIAL / RECONSIDERATION / FINAL), cycle number, submitted_at, decision_issued_at, outcome, reviewer, parent cycle |
| `dataqs_correspondence` | source, external id, original payload, sent_at, received_at, verified_by |
| `dataqs_clocks` | type, base event, policy version, due_at, confidence, override reason |
| `dataqs_clock_pauses` | clock id, paused_at, resumed_at |
| `dataqs_tasks` | case, assignee, due_at, kind, done_at |
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
backend/app/api/v1/routes/dataqs.py
  POST /carriers/{usdot}/dataqs/cases                create intake (idempotency key)
  POST /dataqs/cases/{id}/evidence                   upload; finalize after scan
  GET  /dataqs/cases, /dataqs/cases/{id}
frontend/src/api/dataqs.ts
frontend/src/hooks/useDataQs.ts
frontend/src/types/dataqs.ts
frontend/src/features/dataqs/RequestDataReviewButton.tsx
frontend/src/features/dataqs/intake/DataQsIntakeWizard.tsx   + one file per step
frontend/src/features/dataqs/DataQsEvidenceUpload.tsx
frontend/src/features/dataqs/DataQsCarrierDashboard.tsx      records, eligibility, cases, freshness
frontend/src/features/dataqs/DataQsCaseRoom.tsx              issues, uploads, next action (carrier)
backend/tests/dataqs/test_dataqs_eligibility.py, test_dataqs_intake.py
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
backend/app/services/dataqs_assessment_service.py
backend/app/services/dataqs_package_service.py       build, freeze, hash, invalidate on edit
  POST /dataqs/cases/{id}/assessments
  POST /dataqs/cases/{id}/packages
  POST /dataqs/cases/{id}/approvals
frontend/src/features/dataqs/DataQsStaffQueue.tsx
frontend/src/features/dataqs/DataQsAssessmentPanel.tsx
frontend/src/features/dataqs/DataQsPackageReview.tsx      carrier approves here
backend/tests/dataqs/test_dataqs_package_approval.py
```

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
backend/app/services/dataqs_filing_adapter.py        contract + ManualFilingAdapter
  POST /dataqs/cases/{id}/submission-attempts
  POST /dataqs/cases/{id}/submission-attempts/{attempt_id}/confirm   (receipt required)
frontend/src/features/dataqs/DataQsSubmissionConsole.tsx
backend/tests/dataqs/test_dataqs_filing.py
```

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
backend/app/services/dataqs_clock_service.py         rules, pauses, remaining days
backend/app/services/dataqs_lifecycle.py             allowed transitions per event
backend/app/services/dataqs_correspondence_service.py
  POST /dataqs/cases/{id}/correspondence
  POST /dataqs/cases/{id}/review-requests
  GET  /dataqs/cases/{id}/timeline, /dataqs/cases/{id}/tasks
frontend/src/features/dataqs/DataQsDecisionWorkspace.tsx
frontend/src/features/dataqs/DataQsTimeline.tsx
backend/tests/dataqs/test_dataqs_clock.py, test_dataqs_lifecycle.py
```

**Done when:** pause, resume, overlapping pauses, late imported decision, new evidence on appeal and
reopening all pass their tests.

---

## Phase 6: Verification, reminders and reporting

**Goal:** confirm the record actually changed, and nobody misses a deadline.

**What gets built**

- **Outcome verification:** four separate milestones: requested correction → government decision
  → FMCSA record changed → shown in CarrierSafetyScan. Before/after snapshots with observed time.
  "Correction approved, awaiting refresh" until the change is seen (SMS/PSP refresh monthly).
- **Tasks and reminders:** in-app tasks immediately; reminders 7/3/1 days before evidence
  deadlines and 14/7/3/1 before appeal deadlines; escalate missing acknowledgements, late
  decisions, uncertain dates and unassigned cases.
- **Notifications** via the `dataqs_outbox` and the existing job worker: stable ids, retries,
  no duplicates, delivery status kept.
- **Carrier view** shows the last verified government update time and "awaiting staff
  verification" when relevant.
- **Supervisor view:** unassigned work, deadline exceptions, stale statuses, workload, audit export.

**Files**

```
backend/app/services/dataqs_verification_service.py
backend/app/services/dataqs_notifications.py         outbox + reminder schedule
backend/app/jobs/handlers.py                         + DataQs reminder / outbox jobs
frontend/src/features/dataqs/DataQsSupervisorView.tsx
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

## 6. Decision log

| Date | Decision | By |
|---|---|---|
| 2026-10-21 | DataQs tab in the client portal and the STS (internal) portal; opens a new DataQs page | User |
| 2026-10-21 | All DataQs code, tables and routes prefixed `dataqs` | User |
| 2026-10-21 | Manual filing only; no DataQs automation until permitted by DataQs | Spec |
