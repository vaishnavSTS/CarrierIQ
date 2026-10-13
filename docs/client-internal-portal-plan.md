# CarrierIQ — Client and Internal Portal Plan

Working document for turning CarrierIQ into two portals: one for STS internal staff and one for
STS clients. Edit freely as decisions are made; record each decision in the log at the bottom.

**Status:** Phase A built (2026-10-13): landing page, login, client sign-up with STS approval, client portal home
**Created:** 2026-10-13
**Related:** `../../PROJECT_SPECIFICATION.md`, `../CHECKPOINT.md`, `../../reports/CarrierIQ competitor landscape.md`

---

## 1. Goal

- **Internal portal** — STS staff understand any carrier in depth: all data, raw evidence, signal
  reviews, internal notes, data refresh and job controls.
- **Client portal** — STS clients see a clear, curated view of their carrier(s): how brokers' checks
  are likely to see them, what to fix, and a packet they can share.

Why: the competitor research found no product that explains to a carrier what a broker's check
may flag and how to fix it. Most of the screens for this already exist (Network & Identity,
How to improve, Packet) but are written for an internal reader.

---

## 2. Approach

**One application, one backend, one database — two experiences decided by who logs in.**
Not two separate apps.

```
                    ┌─────────── CarrierIQ (one backend, one DB) ───────────┐
                    │                                                        │
   STS staff ──► Internal portal                     Client portal ◄── Clients
                 • search any carrier                • their own carrier(s)
                 • all tabs + raw evidence           • "how brokers see you" self-check
                 • review/dismiss signals, notes     • how to improve (CSA, fixes)
                 • jobs, refresh, data sources       • packet / PDF to send brokers
                 • client management                 • alerts when something changes
                 • experimental data (e.g. ISS est.) • request help from STS ──► internal
```

---

## 3. Roles

| Role | Portal | Can do |
|---|---|---|
| STS admin | Internal | Everything, including managing clients and users |
| STS analyst | Internal | All carrier data, signal reviews, internal notes |
| Client admin | Client | Their organization's carriers; invite their own staff |
| Client user | Client | View only |

_Open: do clients get any edit rights (e.g. notes visible to STS)?_

---

## 4. What each portal shows

| Feature | Internal | Client | Notes |
|---|---|---|---|
| Search any carrier | ✅ | ❓ | Depends on client type (see Section 7) |
| Identity, Authority & Insurance, Safety, Equipment tabs | ✅ | ✅ | Client wording reviewed |
| Timeline | ✅ | ✅ | |
| Intelligence signals | ✅ full | ❓ simplified | Clients see findings, not review workflow |
| Signal review status and internal notes | ✅ | ❌ | Must never reach clients |
| Network & Identity (linked carriers) | ✅ | ❓ | Linked-carrier names may be sensitive |
| "How brokers' checks may see you" self-check | ✅ | ✅ | New — built from Network checks + Packet |
| How to improve (CSA weights, 49 CFR, DataQs) | ✅ | ✅ | |
| Packet / PDF | ✅ | ✅ | |
| Refresh now / job queue / data sources | ✅ | ❌ (or limited) | FMCSA rate limits |
| Experimental data (estimated ISS, etc.) | ✅ | ❌ | Internal until validated |
| Alerts / watchlist | ✅ | ✅ | New |
| "Ask STS" help request | receives | sends | New |
| Client and user management | ✅ | client admin only, own org | New |

---

## 4a. Carrier profile tabs for clients (confirmed 2026-10-13)

Internal portal keeps all 8 tabs. Client portal, for their own verified carrier(s) only:

| Tab (internal name) | Client? | Client version |
|---|---|---|
| Identity | ✅ | As is: their FMCSA census record |
| Authority & Insurance | ✅ | As is, incl. renewal estimate and BOC-3 |
| Safety | ✅ | As is, incl. CSA BASICs, OOS vs national, How to improve |
| Equipment | ✅ | Their VINs; shared-VIN lines without other carriers' details |
| Network & Identity | ✅ reworded | "How brokers' checks may see you": registration checks + flags with fixes; linked carriers shown by name (public FMCSA data) |
| Packet | ✅ | As is, downloadable PDF to send brokers |
| Timeline | ❌ for now | Not needed yet: Packet lists recent events, Authority tab shows history. Revisit if clients ask |
| Intelligence | ❌ | Internal: signals, review status and STS notes |

Also hidden from clients: Refresh now / jobs, search of other carriers, review actions.

---

## 5. Changes needed in the current code

1. **Login** — none today; every endpoint is open. Proposed: Supabase Auth (already on Supabase),
   FastAPI verifies the token and reads the user's role and organization.
2. **Organizations** — new table; users belong to one organization (STS or a client).
3. **Data separation** — signal review status and team notes are currently global. Mark them
   internal or scope them to an organization so clients never see STS notes.
4. **Access rules** — which carriers a client can see (e.g. carriers linked to their organization).
   Every endpoint needs tests proving client A cannot read client B's data.
5. **Refresh limits** — "Refresh now" calls FMCSA; restrict or rate-limit for clients.
6. **Client wording** — "brokers' checks commonly flag", never "you were rejected because";
   no verdicts or scores (consistent with the rest of CarrierIQ).
7. **Hosting** — clients need a real URL: CI/CD pipeline, production frontend build
   (current frontend image runs the Vite dev server), hosting provider.

---

## 6. Phases

- [x] **Phase A — Login, organizations, roles.** STS staff log in and see what they see today. Done 2026-10-13 (approval is API-only for now; an approval screen is still to build).
- [x] **Phase B — Internal-only data.** Notes, reviews and job controls hidden from clients (server-side, services/client_view.py). Done 2026-10-13.
- [x] **Phase C — Client portal v1.** My carriers, carrier view with the 6 client tabs (section 4a). Done 2026-10-13. Client-specific wording of the broker-flag checks still to review.
- [ ] **Phase D — CI, production build, hosting and CD.**
- [ ] **Phase E — Alerts and watchlist.**
- [ ] **Phase F — "Ask STS" requests** from clients into the internal portal.

---

## 7. Open questions

- [ ] **Who are STS's clients — carriers, brokers, or both?**
  - Carriers → client portal is a self-check of their own company; they see only their USDOT numbers.
  - Brokers → client portal is a vetting tool (search any carrier, watchlist, packets); competes
    with Highway, CarrierOK and others.
  - Both → launch one side first.
- [ ] How does a client get linked to their USDOT number(s)? (STS assigns / client claims and STS verifies)
- [ ] Is the client portal free, part of an STS service, or paid?
- [ ] Hosting provider (Render / Railway / Fly.io / AWS / own VM).
- [ ] Domain name for the portals (one domain with roles, or separate subdomains).
- [ ] Should clients see linked carriers by name?
- [ ] ISS estimate: stays internal-only until validated; data-source permission still to confirm.
- [x] Client registration: **self-sign-up with STS approval** (confirmed 2026-10-13).
- [ ] Landing page: simple (name, description, Log in / Sign up) or full marketing page?
- [x] Login methods: email + password **and Google** (2026-10-14). Microsoft still open.

---

## 7a. Landing, login and registration (proposed)

| Route | Who |
|---|---|
| `/` | Public landing page |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Public |
| `/dashboard`, `/search`, `/carriers/*` | STS staff only — existing URLs kept; only the dashboard moved off `/` |
| `/portal/*` | Clients only — new pages |

- Supabase Auth for sign-up, login, email verification, password reset.
- Clients register themselves, start as **pending** until STS approves and links their USDOT number(s).
- STS staff cannot self-register; an STS admin invites them.
- Roles live in our database, never chosen in the browser.
- The backend checks the login token on every endpoint; hiding pages in React is not security.
- Build order: (1) landing + auth pages, dashboard moved to `/dashboard`; (2) backend token checks, users /
  organizations / roles tables; (3) STS approval screen; (4) client portal pages.

---

## 8. Decision log

| Date | Decision | Why |
|---|---|---|
| 2026-10-13 | One app with role-based portals, not two apps | Shared data and screens; less to maintain |
| 2026-10-13 | Own login in FastAPI (scrypt password hashes, signed token in an HttpOnly cookie) instead of Supabase Auth | No extra keys or service to configure; fully tested locally. Email verification and password reset still to add (need an email provider). |
| 2026-10-13 | Clients self-register and wait for STS approval; staff are created by command | Confirmed by the user. Nobody can claim another company's USDOT number |
| 2026-10-13 | Sign-up requires name, email, mobile number and USDOT; admin sees whether phone / email match FMCSA's record | Faster, safer approval |
| 2026-10-13 | Client tabs: Identity, Authority & Insurance, Safety, Equipment, Network & Identity (with linked carrier names), Packet. Timeline and Intelligence internal only | User decision |
| 2026-10-14 | Google sign-in: new Google users must give mobile + USDOT before the request reaches STS; approval unchanged | User decision |
| 2026-10-13 | Internal pages keep their URLs (`/dashboard`, `/search`, `/carriers/*`) | Fewer link changes than moving everything under `/app` |
