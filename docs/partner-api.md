# CarrierSafetyScan Partner API

Get a motor carrier's **Estimated ISS** (Inspection Selection System score) for a month, by its
USDOT number. The answer is the score and nothing else.

CarrierSafetyScan is run by Sky Transport Solutions. Questions: info@skytransportsolutions.com ·
(800) 498-9820.

---

## At a glance

| | |
|---|---|
| Base URL | `https://carriersafetyscan.com/api/v1` |
| Endpoint | `GET /partner/iss/{usdot_number}` |
| Authentication | `X-Api-Key` header, with the key Sky Transport Solutions gave you |
| Format | JSON, UTF-8 |
| Rate limit | 60 requests a minute per key |
| Protocol | HTTPS only |

---

## Authentication

Send your key in the `X-Api-Key` header on every request.

```
X-Api-Key: css_…
```

- Keep the key secret: on your server only, never in a web page, a mobile app or a public
  repository.
- If a key leaks, contact Sky Transport Solutions: the key is switched off and a new one issued.
- A missing or wrong key gets `401`.

---

## Get a carrier's Estimated ISS

```
GET /partner/iss/{usdot_number}?month=YYYY-MM
```

| Parameter | In | Required | Description |
|---|---|---|---|
| `usdot_number` | path | yes | The carrier's USDOT number, digits only (1 to 99,999,999) |
| `month` | query | no | The FMCSA data month, as `YYYY-MM`. Leave it out for the newest month |

### What happens

1. **A score is already saved** for that USDOT and month: it is returned straight away.
2. **No score is saved, and you asked for the newest month** (or left `month` out): the carrier
   is fetched from FMCSA's public records, its Estimated ISS is calculated and saved, then
   returned. This takes a few extra seconds. Later requests for the same USDOT and month return
   the saved score.
3. **No score is saved for an earlier month:** `404`. Earlier months can't be calculated after the
   fact, because FMCSA's national data for them is no longer used.

### Response `200 OK`

```json
{
  "usdot_number": 2465630,
  "month": "2026-11",
  "estimated_iss": 96
}
```

| Field | Type | Description |
|---|---|---|
| `usdot_number` | integer | The USDOT number you asked about |
| `month` | string | The FMCSA data month the score is built from, `YYYY-MM` |
| `estimated_iss` | integer or `null` | 1 to 100, **lower is better**. `null` when FMCSA's data isn't enough for a score |

How to read the score (FMCSA's bands):

| Score | FMCSA recommendation | CarrierSafetyScan wording |
|---|---|---|
| 1–49 | Pass | Satisfactory |
| 50–74 | Optional | At risk |
| 75–100 | Inspect | High risk |

100 means the carrier has an active out-of-service order.

> The Estimated ISS is CarrierSafetyScan's estimate of FMCSA's ISS, calculated from public FMCSA
> data with FMCSA's published methods. It is not FMCSA's official ISS and not a safety rating.
> How it is worked out: https://carriersafetyscan.com/methodology

---

## Errors

Errors come back as JSON with a code you can check and a message you can log:

```json
{ "error": { "code": "carrier_not_found", "message": "No carrier with USDOT 99999998 in FMCSA's data" } }
```

| Status | `error.code` | When |
|---|---|---|
| `401` | `not_authenticated` | The `X-Api-Key` header is missing or wrong |
| `404` | `carrier_not_found` | FMCSA has no carrier with that USDOT number |
| `404` | `not_found` | No score saved for that earlier month, or FMCSA's monthly data isn't loaded yet |
| `422` | `validation_error` | The month isn't a real month, for example `2026-13` |
| `422` | *(see below)* | The USDOT or month isn't written as required, for example `month=October` |
| `429` | `rate_limited` | More than 60 requests in a minute. Wait for the seconds in the `Retry-After` header |
| `5xx` | | A problem on our side, or FMCSA couldn't be reached. Try again later |

A badly written parameter (for example `month=October`, or letters in the USDOT number) gets a
`422` in a different shape, with the problem under `detail`:

```json
{ "detail": [ { "loc": ["query", "month"], "msg": "String should match pattern '^\\d{4}-\\d{2}$'" } ] }
```

---

## Examples

### curl

```bash
curl -H "X-Api-Key: $CSS_API_KEY" \
  https://carriersafetyscan.com/api/v1/partner/iss/2465630
```

A specific month:

```bash
curl -H "X-Api-Key: $CSS_API_KEY" \
  "https://carriersafetyscan.com/api/v1/partner/iss/2465630?month=2026-11"
```

### JavaScript (Node.js 18+)

```js
const response = await fetch(
  `https://carriersafetyscan.com/api/v1/partner/iss/${usdot}`,
  { headers: { 'X-Api-Key': process.env.CSS_API_KEY }, signal: AbortSignal.timeout(90_000) },
)
if (!response.ok) throw new Error(`Estimated ISS: ${response.status} ${await response.text()}`)
const { month, estimated_iss } = await response.json()
```

### Python

```python
import os
import requests

response = requests.get(
    f"https://carriersafetyscan.com/api/v1/partner/iss/{usdot}",
    headers={"X-Api-Key": os.environ["CSS_API_KEY"]},
    timeout=90,
)
response.raise_for_status()
score = response.json()["estimated_iss"]
```

---

## Good to know

- **Timeouts:** allow up to 90 seconds. The server can take up to a minute to answer the first
  request after a quiet spell, and a USDOT number never looked up before takes a few seconds while
  it is fetched from FMCSA. Most answers come back in about a second.
- **The month:** FMCSA updates its safety data once a month. Without `month`, you get the score
  from FMCSA's newest data, which is labelled with the month FMCSA published it.
- **Caching:** a score for a month doesn't change once saved, so you can keep it on your side.
- **Personal information:** the response holds none.

---

## For Sky Transport Solutions staff

*Not for partners: leave this section out when sending the guide.*

- **Making a key:** in the `backend` folder, run `python -m app.workers.new_partner_key`. Give the
  printed key to the partner once. Add the printed hash to `PARTNER_API_KEY_HASHES` in the VM's
  `backend/.env`, comma-separated when there is more than one partner, then restart the backend
  (`./deploy.sh`, or the compose `up -d backend` command at the top of `deploy.sh`).
- **Switching a key off:** remove its hash from `PARTNER_API_KEY_HASHES`.
- Only the SHA-256 hash of each key is kept on the server; a lost key can't be read back, so make
  a new one.
- Code: `backend/app/api/v1/routes/partner.py`, `backend/app/services/partner_iss.py`,
  tests in `backend/tests/api/test_partner_iss.py`.
