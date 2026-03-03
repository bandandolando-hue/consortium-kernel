# Consortium Kernel — Slice Map (v0 → v3)

This is the “done is done” checklist path. Each slice is a vertical, testable unit. Don’t start the next slice until the acceptance tests pass.

---

## Slice 0 — Runtime + Ping (Hello Kernel)

**Goal**
- Prove the Worker runs locally and (optionally) remotely.

**Deliverables**
- `src/index.ts` responds to `GET /`
- Response is JSON and includes `request_id`

**Endpoints**
- `GET /` → `{ ok, service, request_id }`

**Acceptance Tests**
- `curl -i http://127.0.0.1:PORT/` returns 200 + JSON with `request_id`

**Definition of Done**
- You can hit `/` repeatedly and always get valid JSON + new `request_id`

---

## Slice 1 — Ledger Spine + Council Write (Create Decision + Tasks)

**Goal**
- Persist a decision + tasks to D1 and log the run.

**DB**
Tables (minimum):
- `decisions(id TEXT PK, goal TEXT, decision_json TEXT, status TEXT, created_at TEXT)`
- `tasks(id TEXT PK, decision_id TEXT, description TEXT, status TEXT, created_at TEXT)`
- `runs(id TEXT PK, request_id TEXT, route TEXT, ok INTEGER, error TEXT, created_at TEXT)`

**Bindings**
- D1 binding: `env.DB` → `consortium_ledger`

**Endpoints**
- `POST /council`
  - request JSON: `{ "goal": "string" }`
  - response JSON: `{ decision_id, decision, tasks, request_id }`

**Observability**
- Every request generates `request_id`
- Insert `runs` row for `/council` with ok=1/0

**Acceptance Tests**
1) POST returns 200 + `decision_id` + `request_id`
2) D1 contains one new row in `decisions`
3) D1 contains N rows in `tasks` linked by `decision_id`
4) D1 contains one new row in `runs` for route `/council`

**Definition of Done**
- A POST to `/council` reliably writes all 3 tables and returns a stable packet.

---

## Slice 1.1 — Routing Hardening (No More 404 Drift)

**Goal**
- Eliminate path/method mismatch footguns.

**Deliverables**
- Normalize path (strip trailing slashes)
- Add self-describing GET hints

**Endpoints**
- `GET /council` → `{ ok: true, hint: "POST {goal} to /council", request_id }`
- `POST /council` works even if client hits `/council/`

**Acceptance Tests**
- `GET /council` returns 200
- `POST /council` succeeds for `/council` and `/council/`

**Definition of Done**
- You cannot accidentally “404 not_found” due to a trailing slash or browsing the route.

---

## Slice 2 — Readback (Decision Retrieval)

**Goal**
- Fetch a stored decision and its tasks by id.

**Endpoints**
- `GET /decisions/:id`
  - response JSON:
    ```json
    {
      "decision_id": "uuid",
      "decision": { ... },
      "tasks": [ ... ],
      "request_id": "uuid"
    }
    ```

**DB Queries**
- Select decision row from `decisions`
- Select tasks from `tasks` where `decision_id = :id`

**Acceptance Tests**
1) Use `decision_id` returned from Slice 1
2) `GET /decisions/:id` returns 200 and the same decision + tasks
3) `GET /decisions/bad-id` returns 400 invalid_id (or 404 not_found)
4) Request logs to `runs` for route `/decisions/:id`

**Definition of Done**
- Anything written by `/council` is retrievable by ID.

---

## Slice 2.1 — Contract Pack Artifacts (Governance Becomes Real)

**Goal**
- Store and validate “Contract Packs” as first-class artifacts.

**Deliverables**
- `/schemas/contract-pack.schema.json` exists in repo
- Kernel can validate a contract pack JSON against schema (optional in v1)
- Contract packs stored alongside code (git), not in D1 (initially)

**Acceptance Tests**
- Contract pack JSON validates against schema (manual or scripted)
- Repo contains at least one real contract pack for a live endpoint (e.g. `decisions.getById`)

**Definition of Done**
- A human and the Council can both produce the same structured contract.

---

## Slice 3 — Access Control (Devuser + Service Token)

**Goal**
- Ensure Consortium Kernel is not publicly callable.

**Mechanism (Cloudflare Stack)**
- Cloudflare Access protecting:
  - Entire Worker hostname OR specific paths
- Service token for machine callers (Nexus/ARCforge later)

**Acceptance Tests**
- Unauthorized requests receive 401/403
- Authorized devuser can call endpoints
- Service token can call endpoints headlessly

**Definition of Done**
- Only trusted identities can hit `/council` and `/decisions/:id`.

---

## Slice 3.1 — “Room” UI Stub (Operational Console)

**Goal**
- Minimal UI to submit a goal and display returned packet + debug info.

**UI States**
- idle, loading, success, error

**Features**
- Input box: goal
- Button: Submit to `/council`
- Output: decision_id, request_id, tasks list
- Button: Copy debug info (request_id, route, timestamp)

**Acceptance Tests**
- UI can create decision via `/council`
- UI displays `request_id` on error and success

**Definition of Done**
- The Consortium has a human-facing control surface.

---

# “Slice Complete” Gate (Non-Negotiable)
A slice is only complete when:
- Endpoint works
- DB writes/reads verified
- `request_id` is present
- `runs` logs exist
- At least 1 curl-based acceptance test is documented and repeatable

---

# Recommended Next Slice to Finish (Given Tonight’s State)
If you paused during 404 chaos, the fastest win is:

✅ Slice 1 + Slice 1.1:
- `/council` writes + returns packet
- route normalization prevents 404 drift
- `GET /council` tells you how to use it

That gives you a stable spine before anything else.