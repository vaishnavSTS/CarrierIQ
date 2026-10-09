# CarrierIQ architecture

CarrierIQ pulls a motor carrier's public federal records, keeps every version it sees, and turns
changes and patterns into review signals. Each signal shows the exact records behind it.

The diagrams below are Mermaid flowcharts. They render on GitHub and in VS Code, with the
"Markdown Preview Mermaid Support" extension.

---

## 1. System overview

How data flows from the public sources to the screens office staff use.

```mermaid
flowchart TD
    subgraph SRC["1 · Public data sources"]
        CEN["FMCSA company census<br/>az4n-8mr2"]
        INS["FMCSA inspections<br/>fx4q-ay7w · wt8s-2hbx · 876r-jsdb"]
        MOT["FMCSA Motus: authority + insurance<br/>inys-ebih · yu5v-wbh6 · c5y8-a4uz · 3uet-3z4i"]
        LI["FMCSA L&I legacy<br/>no updates after 2026-05-14"]
        VPIC["NHTSA vPIC<br/>VIN decoding"]
    end

    subgraph ING["2 · Ingestion"]
        FETCH["Fetch with retries<br/>paging, backoff"]
        RAW["Store raw record<br/>unchanged + SHA-256 hash"]
        NORM["Normalize<br/>names, phones, addresses, dates, amounts"]
        DEC["Decode VINs<br/>50 per call, 4 in parallel, once per VIN"]
    end

    subgraph DB["3 · PostgreSQL on Supabase"]
        D1[("Raw<br/>raw_records, ingestion_runs")]
        D2[("Current view<br/>carriers, addresses, phones, officers,<br/>authority, insurance, inspections, vehicles")]
        D3[("History<br/>carrier_attribute_history,<br/>authority_history, carrier_snapshots")]
        D4[("Derived<br/>timeline_events, relationships,<br/>intelligence_signals, signal_evidence")]
        D5[("Operations<br/>jobs, worker_heartbeats")]
    end

    subgraph ENG["4 · Intelligence engine"]
        RULES["6 deterministic rules<br/>every signal must carry evidence"]
    end

    subgraph API["5 · FastAPI /api/v1"]
        A1["/carriers/search"]
        A2["/carriers/{usdot} + /safety /authority<br/>/equipment /signals"]
        A3["PATCH /signals/{id}"]
        A4["/jobs · POST /carriers/{usdot}/refresh"]
    end

    subgraph WEB["6 · React web app"]
        W1["Dashboard"]
        W2["Search"]
        W3["Carrier profile tabs"]
    end

    WORKER["Background worker<br/>python -m app.workers.worker"]

    CEN & INS & MOT & LI --> FETCH
    VPIC --> DEC
    FETCH --> RAW --> NORM
    RAW --> D1
    NORM --> D2
    NORM --> D3
    DEC --> D2
    D2 & D3 --> RULES
    RULES --> D4
    D1 & D2 & D3 & D4 & D5 --> API
    API --> WEB
    WORKER <--> D5
    WORKER --> FETCH
```

---

## 2. Looking up a carrier

What happens when someone searches for a carrier and opens its profile.

```mermaid
flowchart TD
    START(["User searches:<br/>USDOT, MC/MX/FF docket or name"]) --> KNOWN{"Carrier already<br/>in CarrierIQ?"}
    KNOWN -- No --> LIVE["Look it up live in the<br/>FMCSA census"]
    LIVE --> OPEN
    KNOWN -- Yes --> OPEN["User opens the carrier"]
    OPEN --> FRESH{"Data newer than<br/>24 hours?"}
    FRESH -- Yes --> SHOW
    FRESH -- No --> FETCH["Fetch census, inspections,<br/>shared VINs, authority, insurance"]
    FETCH --> OK{"Did every source<br/>answer?"}
    OK -- No --> STALE["Show stored data,<br/>marked stale"]
    OK -- Yes --> SAVE["Save raw rows, update current view,<br/>record changes in history"]
    SAVE --> VINS["Link VINs to the carrier;<br/>decode new VINs with NHTSA"]
    VINS --> TL["Rebuild the timeline"]
    TL --> SIG["Re-run the 6 rules;<br/>keep earlier review decisions"]
    SIG --> SHOW(["Show the profile:<br/>header + 6 tabs"])
    STALE --> SHOW
```

---

## 3. Background worker

Keeps loaded carriers fresh without anyone opening them. The job queue is a table in the same
database, so no extra service such as Redis is needed.

```mermaid
flowchart TD
    LOOP(["Worker running"]) --> BEAT["Check in every 30 s<br/>worker_heartbeats"]
    BEAT --> ROUND{"15 minutes since<br/>the last round?"}
    ROUND -- Yes --> FIND["Find carriers with data<br/>older than 24 hours"]
    FIND --> QUEUE["Queue up to 50 refresh jobs<br/>oldest first, one per carrier"]
    QUEUE --> CLAIM
    ROUND -- No --> CLAIM{"A job due<br/>in the queue?"}
    BTN["Refresh now button<br/>on a carrier page"] --> CLAIMQ["Queue a forced refresh"] --> CLAIM
    CLAIM -- No --> WAIT["Wait 5 s"] --> LOOP
    CLAIM -- Yes --> RUN["Run the full refresh<br/>same as opening the carrier"]
    RUN --> RES{"Succeeded?"}
    RES -- Yes --> DONE["Job SUCCEEDED"] --> LOOP
    RES -- No --> TRIES{"4 attempts used?"}
    TRIES -- No --> RETRY["Back in the queue<br/>retry after 1, 2, then 4 minutes"] --> LOOP
    TRIES -- Yes --> FAIL["Job FAILED, error kept;<br/>scheduler waits 6 h for this carrier"] --> LOOP
```

---

## 4. How a signal is made and reviewed

```mermaid
flowchart LR
    REC[("Stored records<br/>authority, insurance, census history,<br/>inspections, VIN links")] --> RULE["Rule runs<br/>e.g. Shared VIN v1.1"]
    RULE --> EV{"Has at least one<br/>evidence row?"}
    EV -- No --> STOP["Whole run stops;<br/>nothing saved"]
    EV -- Yes --> SAVE["Save or update the signal<br/>stable key keeps its id"]
    SAVE --> UI["Intelligence tab:<br/>card, evidence drawer"]
    UI --> REV{"Reviewer decides"}
    REV -- Reviewed --> R1["REVIEWED + note"]
    REV -- Dismissed --> R2["DISMISSED + note"]
    REV -- Reopen --> R3["OPEN again"]
    R1 & R2 --> KEEP["Decision kept on every<br/>later refresh"]
```

### The six rules

| Rule | Looks for | Typical severity |
|---|---|---|
| Authority change | Revoked, suspended, reinstated or pending-revocation authority in the last 2 years | High for revoked or suspended |
| Insurance change | New insurer, coverage change, cancellation, coverage gap, required insurance not on file | Info for a new insurer; Medium for a gap |
| Identity change | Changed legal name, DBA, email, address, phone, officers or web domain | Medium for a legal name |
| Fleet consistency | Registered trucks vs. trucks seen on inspections in 24 months | Low |
| Safety trend | Out-of-service rate in the last 12 months vs. the 12 before | Low; Medium for a rise of 20+ points |
| Shared VIN | The same vehicle inspected under another USDOT number | Low; Medium for 3+ vehicles |

Signals use careful wording such as "requires review" or "potential relationship". They prompt a
review; they are not findings.

---

## 5. Carrier profile tabs and their sources

```mermaid
flowchart LR
    CEN["FMCSA company census"] --> T1["Identity"]
    MOT["FMCSA Motus + L&I"] --> T2["Authority & Insurance"]
    INS["FMCSA inspections + violations"] --> T3["Safety"]
    UNITS["FMCSA inspection units"] --> T4["Equipment"]
    VPIC["NHTSA vPIC"] --> T4
    ENG["Intelligence engine"] --> T5["Intelligence"]
    HIST["Authority + insurance history,<br/>recorded changes"] --> T6["Timeline"]
```

| Tab | What it shows |
|---|---|
| Identity | Legal and DBA name, entity type, drivers, MCS-150 date, officers, phones, addresses |
| Authority & Insurance | MC/MX/FF dockets and status, required vs. filed insurance, policies on file, insurance and authority history |
| Safety | Inspection counts, vehicle and driver out-of-service rates, quarterly trends, violations, inspection list |
| Equipment | Every VIN seen with year, make and model; trucks vs. trailers; registered vs. seen fleet; vehicles also seen under other carriers |
| Intelligence | Signals grouped by type, the evidence behind each, review actions, carriers linked through shared equipment |
| Timeline | Authority and insurance events and recorded changes, newest first, with links to related signals |

---

## 6. Technology

| Layer | Technology |
|---|---|
| Web app | React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, React Router |
| API | Python, FastAPI, Pydantic |
| Data access | SQLAlchemy 2, Alembic migrations, psycopg 3 |
| Database | PostgreSQL on Supabase |
| Background work | Python worker with a PostgreSQL job queue; see [queue-evaluation.md](queue-evaluation.md) |
| Running locally | Docker Compose: backend, worker, frontend, optional local database |

A visual version of this page is in [architecture.html](architecture.html).
