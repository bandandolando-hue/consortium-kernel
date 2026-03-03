#### Test Run: MAX_LIVE_SPECIALISTS Cap + Acceptance Evidence Script

- Timestamp: 2026-02-24T07:27 local
- Objective: Validate that the MAX_LIVE_SPECIALISTS cap and acceptance evidence script do not break contracts or logic.
- Commands run:
  - npm test -- --run
- Results:
  - All tests passed: 18/18
  - No regressions or contract drift detected
  - System remains deterministic and stable
- Next action:
  - Proceed with acceptance smoke and evidence logging as needed

### Session: MAX_LIVE_SPECIALISTS Cap + Acceptance Evidence Script

- Task ID: SK-2026-02-24-01
- Timestamp: 2026-02-24T00:00 local
- Objective: Future-proof live specialist scaling and add standardized acceptance evidence logging.
- Scope:
  - Add MAX_LIVE_SPECIALISTS env var and per-request cap logic to stance generation (default 1, 0 disables live).
  - Add scripts/acceptance-evidence.ts to generate markdown evidence blocks for RUNNING_LOG.md.
- Commands run:
  - Implemented cap logic in src/specialists/interact.ts
  - Created scripts/acceptance-evidence.ts
- Files changed:
  - src/specialists/interact.ts
  - scripts/acceptance-evidence.ts
- Results:
  - Only up to N specialists per request may go live; all others are mocked.
  - Setting MAX_LIVE_SPECIALISTS=0 forces all to mock, even if enabled.
  - Acceptance evidence script prints a markdown block for manual log pasting.
  - No contract or schema drift.
- Open questions:
  - None
- Next action:
  - Validate with acceptance smoke and log evidence block after next run.
# Consortium Kernel Running Log

Use this as a persistent, append-only operational log.

## 2026-02-19

### Session: Slice 0 + Route Stabilization

- Objective: get first slice to return non-404 JSON and harden route handling.
- Changes:
  - Fixed routing in `src/index.ts` by removing accidental early return.
  - Added path normalization for trailing slashes.
  - Added `GET /council` hint response.
  - Updated tests in `test/index.spec.ts` to validate Slice 0 JSON contract.
  - Added playbook doc: `WORKING_PLAYBOOK.md`.
- Verification:
  - `npm test -- --run` passed (2 tests).
  - `GET /` returned 200 with `{ ok, service, request_id }`.
  - `GET /council` returned 200 with usage hint.
  - `POST /council/` reached handler and returned validation error (not 404).

### Session: Slice 1 Local D1 Bring-Up

- Objective: resolve `no such table: decisions` and validate local write path.
- Changes:
  - Added `schemas/ledger.init.sql` with `decisions`, `tasks`, `runs` tables.
  - Added npm scripts in `package.json`:
    - `db:init` (local)
    - `db:init:remote` (remote)
- Verification:
  - `npm run db:init` succeeded.
  - `POST /council` with valid goal returned 200 and decision packet.
  - Local D1 counts after request:
    - decisions: 1
    - tasks: 2
    - runs: 1

### Session: Slice 2 Decision Retrieval

- Objective: implement and verify `GET /decisions/:id` with request logging.
- Changes:
  - Added Slice 2 route in `src/index.ts`:
    - reads decision row by id
    - reads linked tasks
    - returns `{ decision_id, decision, tasks, request_id }`
  - Added runs logging for `/decisions/:id` on success, not found, and db errors.
- Verification:
  - `npm test -- --run` passed (Slice 0 regression check).
  - Live `POST /council` returned 200 with new `decision_id`.
  - Live `GET /decisions/:id` returned matching decision + tasks.
  - Local D1 table counts after flow:
    - decisions: 3
    - tasks: 6
    - runs: 4
  - Recent `runs` rows include `/decisions/:id` with `ok = 1`.

### Session: Slice 2 Test Coverage

- Objective: add automated test coverage for decision retrieval path.
- Changes:
  - Updated `test/index.spec.ts` with integration tests for:
    - successful `POST /council` + `GET /decisions/:id`
    - not-found `GET /decisions/not-a-real-id`
  - Added `beforeAll` D1 schema bootstrap to make tests self-initializing.
- Verification:
  - `npm test -- --run` passed.
  - Result: 4 tests passed, 0 failed.

### Session: Slice 2 Observability Assertion

- Objective: ensure read-path observability is enforced by tests.
- Changes:
  - Updated `test/index.spec.ts` retrieval test to assert `runs` row exists for the read request:
    - `route = '/decisions/:id'`
    - `ok = 1`
- Verification:
  - `npm test -- --run` passed.
  - Result: 4 tests passed, 0 failed.

### Session: Slice 2 Error-Path Observability

- Objective: ensure not-found retrieval writes explicit failed run logs.
- Changes:
  - Updated `test/index.spec.ts` not-found test to assert runs row:
    - `route = '/decisions/:id'`
    - `ok = 0`
    - `error = 'not_found'`
- Verification:
  - `npm test -- --run` passed.
  - Result: 4 tests passed, 0 failed.

### Session: Acceptance Test Run

- Objective: execute acceptance checks for Slice 0–2 live behavior and persistence.
- Automated:
  - `npm test -- --run` passed.
  - Result: 4 tests passed, 0 failed.
- Live API checks:
  - `GET /` returned 200 with `{ ok, service, request_id }`.
  - `GET /council` returned 200 with POST hint.
  - `POST /council` returned 200 with `decision_id` and tasks.
  - `GET /decisions/:id` returned 200 with matching decision packet.
  - `GET /decisions/not-a-real-id` returned 404.
- D1 verification:
  - decisions: 5
  - tasks: 10
  - runs: 8
  - recent `runs` include `/council` success, `/decisions/:id` success, and `/decisions/:id` not_found.

### Session: Slice 2.1 Contract Packs

- Objective: make contract packs first-class and enforce schema validation.
- Changes:
  - Added real contract-pack artifact:
    - `schemas/contract-packs/decisions.getbyid.contract-pack.json`
  - Added schema validation test:
    - `test/contract-pack.spec.ts`
  - Added dependency for JSON Schema validation:
    - `ajv` (dev dependency)
- Verification:
  - `npm test -- --run` passed.
  - Result: 5 tests passed, 0 failed.
  - Contract pack validated successfully against `schemas/contract-pack.schema.json`.

### Session: Slice 3 Access Control

- Objective: ensure kernel endpoints are not publicly callable and support devuser + service token access paths.
- Changes:
  - Added protected-route gate in `src/index.ts` for `/council` and `/decisions/:id`.
  - Added dual auth checks:
    - devuser header: `cf-access-jwt-assertion`
    - service token headers: `cf-access-client-id` + `cf-access-client-secret`
  - Added unauthorized run logging (`error = unauthorized`) to `runs` table.
  - Added local vars in `wrangler.jsonc` for reproducible Slice 3 behavior.
  - Updated and expanded integration tests in `test/index.spec.ts`.
- Verification:
  - `npm run cf-typegen` succeeded.
  - `npm test -- --run` passed.
  - Result: 7 tests passed, 0 failed.
  - Live checks:
    - unauthorized `POST /council` → 403
    - service token `GET /council` → 200
    - devuser token `POST /council` → 200
  - Recent `runs` rows include `/council` with `ok=0,error=unauthorized`.

### Session: Slice 3.1 Room UI Stub

- Objective: provide minimal operational console for creating and inspecting a council response packet.
- Changes:
  - Added `GET /room` route in `src/index.ts`.
  - Added inline UI with required states and controls:
    - states: idle, loading, success, error
    - goal input + submit button posting to `/council`
    - output fields: `decision_id`, `request_id`, tasks list
    - `Copy debug info` button (request_id, route, timestamp)
  - Added integration test in `test/index.spec.ts` for `GET /room`.
- Verification:
  - `npm test -- --run` passed.
  - Result: 8 tests passed, 0 failed.
  - Live `GET /room` returned HTML containing the room controls.

### Session: Slice 3.1 Entry Hint

- Objective: make room console easier to discover from health check.
- Changes:
  - Updated `GET /` payload in `src/index.ts` to include `room: "/room"`.
- Verification:
  - `npm test -- --run` passed.
  - Result: 8 tests passed, 0 failed.

### Session: Slice 3.2 Envelope + Safe Auth Defaults

- Objective: standardize API envelope and harden auth defaults.
- Changes:
  - Added response helpers in `src/index.ts`:
    - `ok(data, requestId, status = 200)`
    - `fail(code, requestId, status, detail?)`
  - Replaced API `json(...)` returns with `ok(...)` / `fail(...)` wrappers.
  - Enforced safe auth default: if protection is enabled and auth secrets are missing, protected routes deny with `error.code = auth_misconfigured`.
  - Removed dev token bootstrap behavior from `/room`.
  - Updated tests to assert response envelopes:
    - `ok` exists on JSON responses
    - `error.code` exists on error responses
- Verification:
  - `npm test -- --run` passed.
  - Result: 9 tests passed, 0 failed.

### Session: Canonical Tasks (No Split Brain)

- Objective: remove duplicated task representation from `decision_json` and keep tasks table canonical.
- Changes:
  - Updated `POST /council` decision object in `src/index.ts` to remove `execution_tasks`.
  - Kept task writes and response-level `tasks` unchanged.
- Verification:
  - `npm test -- --run` passed.
  - Result: 9 tests passed, 0 failed.

### Session: Patch Sets E + F (Contract + Test Confidence)

- Objective: keep contract-pack governance truthful and strengthen response-envelope assertions.
- Changes:
  - Updated `schemas/contract-packs/decisions.getbyid.contract-pack.json`:
    - auth now `required: true`, `strategy: cloudflare_access`
    - added supported auth headers: `cf-access-jwt-assertion`, `cf-access-client-id`, `cf-access-client-secret`
    - updated response bodies to envelope shape (`ok`, `data`, `request_id` / `ok`, `error.code`, `request_id`)
    - updated `error_model` shape and required fields to match runtime
  - Updated `test/index.spec.ts` assertions to enforce:
    - every success JSON response has `ok === true` and `data`
    - every error JSON response has `ok === false` and `error.code`
    - `request_id` present on all JSON success/error responses
- Verification:
  - `npm test -- --run` passed.
  - Result: 9 tests passed, 0 failed.

### Session: Slice 4 — Council Multiplicity + Decision Card Canon

- Objective: upgrade decision payload to include council stances + decision card, and keep readback mirrored and canonical.
- Changes:
  - Updated `src/index.ts`:
    - `POST /council` now returns `council`, `decision_card`, and `tasks` (inside envelope `data`)
    - `decision_json` now stores canonical artifact object containing `council` + `decision_card`
    - `GET /decisions/:id` now mirrors the same structure from stored artifact + task rows
    - task rows remain canonical in `tasks` table; no duplicated task representation in decision artifact
  - Added schema: `schemas/council-artifacts.schema.json` for `CouncilStance` + `DecisionCard`
  - Added contract pack: `schemas/contract-packs/council.post.contract-pack.json`
  - Updated tests:
    - assert `council.length === 5`
    - assert required stance fields (`role`, `stance`, `rationale`, `risks`, `confidence`)
    - assert `decision_card` includes `constraints`, `acceptance_tests`, `definition_of_done`
    - assert returned tasks count/type matches `decision_card.derived_tasks`
    - validate runtime `council + decision_card` against `council-artifacts.schema.json`
    - validate both contract packs against canonical contract-pack schema
- Verification:
  - `npm test -- --run` passed.
  - Result: 10 tests passed, 0 failed.

### Session: Slice 4 Shape Simplification (No Bloat)

- Objective: enforce the smallest stable council and decision_card shapes.
- Changes:
  - Simplified council stance shape in `src/index.ts` and `schemas/council-artifacts.schema.json` to:
    - `role`, `stance`, `risks`, `asks`, `proposed_changes`
  - Simplified decision card shape to:
    - `goal`, `constraints`, `plan`, `acceptance_tests`, `definition_of_done`
  - Kept tasks canonical in `tasks` table, derived from `decision_card.plan`.
  - Updated `schemas/contract-packs/council.post.contract-pack.json` and tests to match this shape.
- Verification:
  - `npm test -- --run` passed.
  - Result: 10 tests passed, 0 failed.

### Session: Specialist Infrastructure v0 (Slice 4.0)

- Objective: add specialist registry + selection function and include selected specialists in council decision artifacts without new tables/endpoints.
- Changes:
  - Added specialist registry schema:
    - `schemas/specialists.registry.schema.v1.json`
  - Added specialist roster entries:
    - `schemas/specialists/specialists.v1.json`
  - Added runtime specialist selector in `src/index.ts`:
    - `selectSpecialists(job)` returns roster subset based on goal tags
  - Updated `/council` and `/decisions/:id` payload/artifact shape to include:
    - `selected_specialists`
    - `council`
    - `decision_card`
    - `tasks` (canonical in table)
  - Kept existing tables and endpoints unchanged.
  - Added test coverage for acceptance checks:
    - `selected_specialists.length > 0`
    - `council` includes Archivist stance
    - `request_id` present and `/council` run logged
  - Added schema validation test for specialists registry.
- Verification:
  - `npm test -- --run` passed.
  - Result: 11 tests passed, 0 failed.

### Session: Specialist Registry Specs — Archivist + Lore

- Objective: add concrete Archivist/Lore selection and stance-schema specs to specialist registry.
- Changes:
  - Extended `schemas/specialists.registry.schema.v1.json`:
    - added `selection_rule` and `stance_schema` fields for each specialist entry
  - Updated `schemas/specialists/specialists.v1.json`:
    - Archivist now has explicit always-include rule (with optional disable token)
    - Archivist stance schema fields added:
      - `canon_updates`, `drift_risks`, `naming_normalizations`, `required_metadata`, `open_questions`, `next_docs`, `referenced_artifacts`
    - Added Lore specialist entry (`NARRATIVE`) with keyword-based selection rule for world/tone/lore/story/codex/inscription/relic/authority/player-facing copy
    - Lore stance schema fields added:
      - `canon_referenced`, `undefined_intentionally`, `tone_risks`, `system_alignment_notes`
      - optional `classification` (canon/apocrypha/flavor)
  - Added baseline `selection_rule` and `stance_schema` metadata to existing specialists for schema consistency.
- Verification:
  - `npm test -- --run` passed.
  - Result: 11 tests passed, 0 failed.

### Session: Slice 4.1 Universal Specialists → Cloudflare Artifact Adapter

- Timestamp: 2026-02-22 18:43 local
- Objective: modularize specialist logic with portable universal registry fields and validated mock artifact stances.
- Scope:
  - add adapter modules for specialist selection, framing, stance validation, and deterministic mock generation
  - rewire worker runtime to use adapter outputs in `/council` and `/decisions/:id`
  - add acceptance checks for Archivist always-selected, Lore trigger selection, stance validation, and runs logging
- Commands run:
  - `npm test -- --run`
- Files changed:
  - `src/specialists/select.ts`
  - `src/specialists/frame.ts`
  - `src/specialists/schemas.ts`
  - `src/specialists/mock.ts`
  - `src/index.ts`
  - `test/index.spec.ts`
  - `schemas/specialists.registry.schema.v1.json`
  - `schemas/specialists/specialists.v1.json`
- Results:
  - Adapter modules are active and runtime now persists + returns `specialist_stances` in decision artifacts.
  - Archivist remains present in selected specialists for standard and narrative goals.
  - Lore specialist is selected when narrative/lore triggers appear in goal text.
  - Returned `specialist_stances` pass `validateSpecialistStance(...)` checks in create/read flows.
  - Full test suite passed: 12 tests, 0 failed.
- Open questions:
  - none
- Next action:
  - optional: promote stance validators to JSON Schema files if contract-pack governance needs schema-path references.

### Session: Slice 4.2 Tiered Interaction + Governance Compliance

- Timestamp: 2026-02-21 19:09 local
- Objective: enforce tiered propose/review/final interaction flow with mandatory governance satisfaction in the persisted decision artifact.
- Scope:
  - add tiered `stages` artifact with `interaction_model: tiered`
  - derive governance `required_changes` from review stances
  - enforce captain satisfaction coverage with explicit hard-fail path
  - keep existing endpoints/tables/envelope/runs/canonical tasks intact
- Commands run:
  - `npm test -- --run`
- Files changed:
  - `src/specialists/interact.ts`
  - `src/specialists/schemas.ts`
  - `src/specialists/mock.ts`
  - `src/index.ts`
  - `schemas/council-artifacts.schema.json`
  - `schemas/contract-packs/council.post.contract-pack.json`
  - `test/index.spec.ts`
- Results:
  - `POST /council` now stores and returns a tiered artifact with `stages: propose, review, final`.
  - Review stage now emits governance `required_changes` (RC ids), and final stage declares `satisfies_required_changes`.
  - Runtime now returns `governance_unsatisfied` (500) if final stage misses any required change ids.
  - `GET /decisions/:id` mirrors stored artifact including `interaction_model` and `stages`.
  - Artifact schema and council contract pack now document the tiered model.
  - Full suite passed: 12 tests, 0 failed.
- Open questions:
  - none
- Next action:
  - optional: add explicit negative test forcing `governance_unsatisfied` via injected mock for deterministic failure-path coverage.

### Session: Slice 4.2.1 Governance Negative-Path Coverage

- Timestamp: 2026-02-21 19:10 local
- Objective: add deterministic automated coverage for `governance_unsatisfied` fail path.
- Scope:
  - add a test-only env injection toggle for forcing governance failure
  - add integration test asserting 500 envelope and `runs` logging for governance failure
  - preserve existing endpoint/table surface and runtime defaults
- Commands run:
  - `npm test -- --run`
- Files changed:
  - `src/index.ts`
  - `test/index.spec.ts`
- Results:
  - Added optional env flag `FORCE_GOVERNANCE_UNSATISFIED` (default off) used only for deterministic negative-path tests.
  - New test validates `POST /council` returns `error.code = governance_unsatisfied` with status 500 when forced.
  - New test validates `runs` row logs `/council`, `ok = 0`, `error = governance_unsatisfied`.
  - Full suite passed: 13 tests, 0 failed.
- Open questions:
  - none
- Next action:
  - optional: expose this injection via dedicated test helper wrapper to avoid direct env flag usage in future tests.

### Session: Slice 4.2.2 Remove Runtime Test Hook (Mock Harness)

- Timestamp: 2026-02-21 08:40 local
- Objective: remove test-only runtime injection surface while preserving deterministic governance failure coverage.
- Scope:
  - remove `FORCE_GOVERNANCE_UNSATISFIED` runtime env branch
  - convert negative-path test to module-mock harness (`runTieredCouncil` mock)
  - keep existing endpoints/tables/envelope/runs behavior unchanged
- Commands run:
  - `npm test -- --run`
- Files changed:
  - `src/index.ts`
  - `test/index.spec.ts`
- Results:
  - Runtime no longer contains test hook env toggle.
  - Negative-path test now deterministically forces unsatisfied governance by mocking `runTieredCouncil`.
  - Test still validates 500 envelope (`error.code = governance_unsatisfied`) and `runs` logging (`/council`, `ok=0`, error code).
  - Full suite passed: 13 tests, 0 failed.
- Open questions:
  - none
- Next action:
  - optional: extract mock setup into a reusable `test/helpers` utility if additional failure-mode tests are added.

### Session: Specialist Roster Canonicalization + Smart Selection Coverage

- Timestamp: 2026-02-22 09:00 local
- Objective: promote the 10 specialist roles (plus Narrative governance) to first-class canonical entries and verify trigger selection behavior.
- Scope:
  - migrate specialist registry schema/entries to canonical IDs and consistent fields
  - align runtime selection/tiering/stance shape to canonical roster
  - add fallback behavior for vague goals and acceptance tests for per-specialist triggers
- Commands run:
  - `npm test -- --run`
- Files changed:
  - `schemas/specialists.registry.schema.v1.json`
  - `schemas/specialists/specialists.v1.json`
  - `src/specialists/select.ts`
  - `src/specialists/frame.ts`
  - `src/specialists/schemas.ts`
  - `src/specialists/mock.ts`
  - `src/specialists/interact.ts`
  - `schemas/council-artifacts.schema.json`
  - `test/index.spec.ts`
- Results:
  - Canonical first-class roster is now active: `ARCHIVIST`, `NARRATIVE`, `AURORA`, `VOX_FORGE`, `GLYPH`, `RHYTHM`, `TERRA`, `PULSE`, `SPECTRA`, `HERMES`, `CATALYST`.
  - Specialist stance shape is unified to minimal fields: `role`, `stance`, `risks`, `asks`, `proposed_changes`.
  - Selection now always includes `ARCHIVIST` and auto-includes `CATALYST` when no propose specialist is triggered.
  - Added acceptance coverage with one goal per specialist trigger plus a vague-goal fallback assertion.
  - Full suite passed: 13 tests, 0 failed after canonical migration; then 14 tests, 0 failed after fallback + trigger matrix test.
- Attempts and fails:
  - Attempted direct migration with no compatibility shim in runtime.
  - Failures encountered: none; tests remained green after each step.
- Open questions:
  - none
- Next action:
  - optional: add explicit contract-pack notes referencing canonical specialist IDs and tier policy.

### Session: Task Log — Registry Schema Migration

- Timestamp: 2026-02-22 08:55 local
- Objective: migrate specialists registry schema to canonical first-class field model.
- Scope:
  - enforce required fields: `id`, `name`, `best_for`, `output_type`, `selection_rule`, `tier`, `stance_schema`
  - enforce `id` uppercase slug pattern and `tier` enum
  - enforce keyword rule requires `keywords`
- Commands run:
  - none
- Files changed:
  - `schemas/specialists.registry.schema.v1.json`
- Results:
  - Schema now validates canonical roster shape and selection-rule structure.
- Attempts and fails:
  - Attempts: 1
  - Fails: 0

### Session: Task Log — Canonical Roster Drop-In

- Timestamp: 2026-02-22 08:56 local
- Objective: install canonical specialist roster entries as first-class records.
- Scope:
  - replace legacy `sp-*` entries with canonical IDs
  - preserve governance split: `ARCHIVIST` always-review, `NARRATIVE` keyword-review
  - set propose tier for `AURORA`, `VOX_FORGE`, `GLYPH`, `RHYTHM`, `TERRA`, `PULSE`, `SPECTRA`, `HERMES`, `CATALYST`
- Commands run:
  - none
- Files changed:
  - `schemas/specialists/specialists.v1.json`
- Results:
  - Roster now matches canonical first-class specialist model.
  - Text sync update applied later to match exact wording: `Story / world / voice constraints`.
- Attempts and fails:
  - Attempts: 2 (initial replace + wording sync)
  - Fails: 0

### Session: Task Log — Selection Rules Upgrade

- Timestamp: 2026-02-22 08:58 local
- Objective: make selection behavior robust for vague and targeted goals.
- Scope:
  - always include `ARCHIVIST`
  - include keyword-matched specialists from registry
  - add fallback `CATALYST` when no propose-tier specialist is selected
- Commands run:
  - none
- Files changed:
  - `src/specialists/select.ts`
- Results:
  - Selection no longer returns governance-only sets for vague goals.
  - Propose stage always has at least one candidate (`CATALYST` fallback).
- Attempts and fails:
  - Attempts: 1
  - Fails: 0

### Session: Task Log — Stance Shape + Tier Runtime Alignment

- Timestamp: 2026-02-22 08:59 local
- Objective: align specialist runtime modules with canonical IDs and minimal stance shape.
- Scope:
  - unify stance shape to `role`, `stance`, `risks`, `asks`, `proposed_changes`
  - update frame/mock/interact modules to canonical IDs and review/propose split
  - align artifact schema specialist stance definition
- Commands run:
  - none
- Files changed:
  - `src/specialists/frame.ts`
  - `src/specialists/schemas.ts`
  - `src/specialists/mock.ts`
  - `src/specialists/interact.ts`
  - `schemas/council-artifacts.schema.json`
- Results:
  - Runtime emits and validates minimal consistent specialist stances.
  - Governance review mapping now centers on `ARCHIVIST` + `NARRATIVE`.
  - Full suite passed: 18 tests, 0 failed.
- Attempts and fails:
  - Attempts: 1
  - Fails: 0

### Session: Task Log — Trigger Acceptance Matrix

- Timestamp: 2026-02-22 09:03 local
- Objective: add regression-safe trigger coverage per specialist.
- Scope:
  - add one trigger case per specialist role
  - assert `ARCHIVIST` is always selected
  - assert vague-goal fallback includes `CATALYST`
- Commands run:
  - none
- Files changed:
  - `test/index.spec.ts`
- Results:
  - Added deterministic trigger coverage for `AURORA`, `VOX_FORGE`, `GLYPH`, `RHYTHM`, `TERRA`, `PULSE`, `SPECTRA`, `HERMES`, `CATALYST`, `NARRATIVE`.
  - Added fallback assertion for non-specific goals.
- Attempts and fails:
  - Attempts: 1
  - Fails: 0

### Session: Task Log — Verification Runs

- Timestamp: 2026-02-22 09:12 local
- Objective: verify all specialist migration and selection changes under acceptance gates.
- Scope:
  - run full test suite after migration and after final roster text sync
- Commands run:
  - `npm test -- --run`
  - `npm test -- --run`
- Files changed:
  - none
- Results:
  - First full run: 14 passed, 0 failed.
  - Second full run after text sync: 14 passed, 0 failed.
- Attempts and fails:
  - Attempts: 2
  - Fails: 0

### Session: Slice 4.2.2 Specialist Selection Regression Suite

- Task ID: SK-2026-02-22-07
- Timestamp: 2026-02-22 09:34 local
- Objective: harden specialist selection against silent drift with endpoint-level regression shields.
- Scope:
  - add trigger coverage tests for each propose specialist
  - add governance-presence assertion (`ARCHIVIST`) in each trigger case
  - add fallback-propose assertion for vague goals (`CATALYST`)
  - keep endpoints and tables unchanged
- Commands run:
  - `npm test -- --run`
- Files changed:
  - `test/index.spec.ts`
  - `RUNNING_LOG.md`
- Results:
  - Added table-driven `/council` trigger suite for: `AURORA`, `VOX_FORGE`, `GLYPH`, `RHYTHM`, `TERRA`, `PULSE`, `SPECTRA`, `HERMES`, `CATALYST`.
  - Each case now asserts `ok === true`, expected specialist selected, `ARCHIVIST` selected, and tiered stages `propose/review/final`.
  - Added vague-goal fallback test (`do the thing`) asserting propose includes `CATALYST` and review includes `ARCHIVIST`.
  - Full suite passed: 15 tests, 0 failed.
- Attempts and fails:
  - Attempts: 1
  - Fails: 0

### Session: Slice 4.2.3 Registry/Keyword Hardening

- Task ID: SK-2026-02-22-08
- Timestamp: 2026-02-22 09:39 local
- Objective: prevent keyword explosion and ambiguous specialist selection drift.
- Scope:
  - normalize goal text once for selection matching (lowercase, punctuation stripped, whitespace collapsed)
  - lock matching rule to explicit word-boundary behavior
  - enforce runtime registry invariants (duplicate IDs, empty keywords, max 50 keywords)
  - add determinism and golden artifact regression tests
  - keep endpoints/tables unchanged
- Commands run:
  - `npm test -- --run`
- Files changed:
  - `src/specialists/select.ts`
  - `test/contract-pack.spec.ts`
  - `test/index.spec.ts`
  - `RUNNING_LOG.md`
- Results:
  - `selectSpecialists` now uses normalized text and explicit word-boundary matching.
  - Added runtime invariant validator in selector module:
    - rejects duplicate specialist IDs
    - rejects empty/whitespace keyword entries
    - rejects keyword lists over 50 entries per specialist
  - Added invariant tests in `test/contract-pack.spec.ts` for all three checks.
  - Added deterministic selection test across case/spacing/punctuation variants.
  - Added golden artifact snapshot guard for `design ui flow for relic generator`:
    - exact selected set `['ARCHIVIST', 'NARRATIVE', 'SPECTRA']`
    - `required_changes` IDs match `RC-###` format
    - `decision_card` required keys present
  - Full suite passed: 18 tests, 0 failed.
- Attempts and fails:
  - Attempts: 1
  - Fails: 0

### Session: Slice 4.3 AI Swap Layer — Step 1 Adapter Add

- Task ID: SK-2026-02-22-09
- Timestamp: 2026-02-22 09:45 local
- Objective: add a real inference adapter module for specialist stances without changing runtime contracts.
- Scope:
  - add `src/ai/openai.ts` adapter that calls OpenAI and returns existing `SpecialistStance` shape
  - enforce validator compatibility and strict response parsing
  - keep runtime wiring unchanged for deterministic tests
- Commands run:
  - `npm test -- --run` (pending after file add)
- Files changed:
  - `src/ai/openai.ts`
  - `RUNNING_LOG.md`
- Results:
  - Added `inferSpecialistStanceWithOpenAI(...)` with:
    - strict JSON response requirement
    - normalized output shape (`role`, `stance`, `risks`, `asks`, `proposed_changes`)
    - `validateSpecialistStance(...)` enforcement before returning
  - Contract/shape remains unchanged; this is an additive adapter layer.
- Attempts and fails:
  - Attempts: 1
  - Fails: 0

### Session: Slice 4.3 AI Swap Layer — Runtime Backend Switch (Mock/OpenAI)

- Task ID: SK-2026-02-22-10
- Timestamp: 2026-02-22 23:54 local
- Objective: route stance generation through env-driven mock/OpenAI backend without changing council governance behavior.
- Scope:
  - update OpenAI adapter to Workers-friendly `POST /v1/responses` structured output mode
  - switch tiered engine from direct mock call to `generateStance(..., env)` backend selector
  - keep tests deterministic via `USE_MOCK_SPECIALISTS=true` in test runtime only
  - preserve selection/tiering/required_changes/final satisfaction enforcement
- Commands run:
  - `npm test -- --run`
- Files changed:
  - `src/ai/openai.ts`
  - `src/specialists/interact.ts`
  - `src/index.ts`
  - `vitest.config.mts`
  - `test/index.spec.ts`
  - `RUNNING_LOG.md`
- Results:
  - `runTieredCouncil(...)` is now async and env-aware, using:
    - mock backend when `USE_MOCK_SPECIALISTS=true`
    - OpenAI backend otherwise (`OPENAI_API_KEY` required)
  - OpenAI adapter now uses `responses` API and structured JSON schema output to constrain stance shape.
  - Test pool now injects `USE_MOCK_SPECIALISTS=true`, keeping suite deterministic and offline.
  - Governance behavior unchanged: required-change derivation and `governance_unsatisfied` enforcement still intact.
  - Full suite passed: 18 tests, 0 failed.
- Attempts and fails:
  - Attempts: 1
  - Fails: 0

### Session: Slice 4.3 Artifact Semantics + Framing Alignment

- Task ID: SK-2026-02-23-01
- Timestamp: 2026-02-23 01:48 local
- Objective: clarify artifact naming semantics and enforce specialist framing output shape without behavior drift.
- Scope:
  - rename 5-seat enum layer from `council` to `quorum`
  - keep `specialist_stances` as specialist-output layer (`role` is specialist id string)
  - upgrade captain frame to explicitly require exact specialist stance JSON shape
  - keep selection/tiering/required_changes/final governance checks unchanged
- Commands run:
  - `npm test -- --run`
- Files changed:
  - `schemas/council-artifacts.schema.json`
  - `src/index.ts`
  - `src/specialists/interact.ts`
  - `src/specialists/frame.ts`
  - `src/specialists/mock.ts`
  - `src/ai/openai.ts`
  - `test/index.spec.ts`
  - `schemas/contract-packs/council.post.contract-pack.json`
  - `RUNNING_LOG.md`
- Results:
  - Artifact schema now requires: `interaction_model`, `selected_specialists`, `stages`, `specialist_stances`, `quorum`, `decision_card`.
  - Executive layer defs renamed: `councilRole`→`seatRole`, `councilStance`→`seatStance`.
  - Runtime write/read paths now emit/parse `quorum` (5 fixed seats), while specialist outputs remain in `specialist_stances`.
  - Framing now provides decision-card spine + stage-aware instructions and strict output JSON shape contract.
  - Full suite passed: 18 tests, 0 failed.
- Attempts and fails:
  - Attempts: 1
  - Fails: 0

### Session: Slice 4.3 Naming Consistency Cleanup

- Task ID: SK-2026-02-23-02
- Timestamp: 2026-02-23 01:50 local
- Objective: complete naming consistency for executive-seat terminology.
- Scope:
  - rename local type alias `CouncilRole` to `SeatRole` in runtime code
  - keep behavior unchanged
- Commands run:
  - `npm test -- --run`
- Files changed:
  - `src/index.ts`
  - `RUNNING_LOG.md`
- Results:
  - Runtime symbol naming now aligns with `quorum`/seat schema terminology.
  - No contract or behavioral changes.
  - Full suite passed: 18 tests, 0 failed.
- Attempts and fails:
  - Attempts: 1
  - Fails: 0

### Session: Slice 4.3 OpenAI Smoke Route (/ai/ping)

- Task ID: SK-2026-02-23-03
- Timestamp: 2026-02-23 04:34 local
- Objective: add a minimal protected OpenAI smoke route to verify Worker → OpenAI → JSON round-trip.
- Scope:
  - add protected `GET /ai/ping`
  - call OpenAI `POST /v1/responses` with json_schema output shape
  - return envelope with `{ model, output }` under `data`
  - keep council loop wiring unchanged
- Commands run:
  - `npm test -- --run`
  - `npx wrangler dev --port 8787`
  - `curl -sS -H "cf-access-jwt-assertion: devuser-local-token" http://127.0.0.1:8787/ai/ping`
- Files changed:
  - `src/index.ts`
  - `RUNNING_LOG.md`
- Results:
  - Added `callOpenAIJson(...)` helper and protected `/ai/ping` route behind existing auth gate.
  - Regression suite remained green: 18 tests, 0 failed.
  - Local smoke route reached handler and returned deterministic error when local secret missing:
    - `error.code = openai_failed`
    - detail: `missing_openai_api_key`
- Attempts and fails:
  - Attempts: 1
  - Fails: 0 (implementation), 1 expected smoke precondition miss (local secret not loaded)

### Session: Slice 4.3 /ai/ping Local Troubleshoot + API Payload Fix

- Task ID: SK-2026-02-23-04
- Timestamp: 2026-02-23 05:08 local
- Objective: complete local `/ai/ping` smoke diagnosis and fix Responses API request shape.
- Scope:
  - debug local secret load path and duplicate dev server instances
  - update Responses API payload fields to current shape
  - re-run smoke and regression suite
- Commands run:
  - `curl.exe -sS -H "cf-access-jwt-assertion: devuser-local-token" http://127.0.0.1:8787/ai/ping`
  - `powershell -NoProfile -Command "Stop-Process -Id 27540,22828 -Force"`
  - `npx wrangler dev --port 8787`
  - `npm test -- --run`
- Files changed:
  - `src/index.ts`
  - `src/ai/openai.ts`
  - `RUNNING_LOG.md`
- Results:
  - Verified root cause sequence:
    - local key initially not loaded (`missing_openai_api_key`)
    - then payload mismatch (`response_format` moved to `text.format`)
    - then input content type mismatch (`text` → `input_text`)
  - Updated both `/ai/ping` helper and OpenAI adapter to use `text.format` JSON schema.
  - `/ai/ping` now reaches OpenAI successfully; current failure is key/role scope (`401`, missing `model.request`).
  - Regression suite remains green: 18 tests, 0 failed.
- Attempts and fails:
  - Attempts: 1
  - Fails: 0 implementation failures; external key permission blocker remains.

### Session: Slice 4.3 /ai/ping Success Validation (Post Key Rotation)

- Task ID: SK-2026-02-23-05
- Timestamp: 2026-02-23 05:49 local
- Objective: verify `/ai/ping` succeeds after rotating local OpenAI API key.
- Scope:
  - call active local worker port with existing devuser auth header
  - confirm Worker → OpenAI → JSON round trip
- Commands run:
  - `curl.exe -sS -H "cf-access-jwt-assertion: devuser-local-token" http://127.0.0.1:8787/ai/ping`
- Files changed:
  - `RUNNING_LOG.md`
- Results:
  - `/ai/ping` now returns `ok: true` with model + parsed JSON payload.
  - Verified returned model string: `gpt-4.1-mini-2025-04-14`.
  - Connectivity/auth/permissions issue resolved for local key.
- Attempts and fails:
  - Attempts: 1
  - Fails: 0

### Session: Slice 4.3 /ai/ping Stability Closure

- Task ID: SK-2026-02-23-06
- Timestamp: 2026-02-23 06:08 local
- Objective: close out local smoke verification with stable endpoint + config state.
- Scope:
  - confirm active local endpoint responds successfully
  - record final operational status after user-side fix
- Commands run:
  - `curl.exe -sS -H "cf-access-jwt-assertion: devuser-local-token" http://127.0.0.1:8976/ai/ping`
- Files changed:
  - `RUNNING_LOG.md`
- Results:
  - `/ai/ping` returns successfully on active local port with auth header.
  - OpenAI integration path is now stable for local smoke checks.
  - Remaining work is operational hygiene only (keep secrets rotated and scoped appropriately).
- Attempts and fails:
  - Attempts: 1
  - Fails: 0

### Session: Slice 4.3 Key Rotation Verification

- Task ID: SK-2026-02-23-07
- Timestamp: 2026-02-23 06:26 local
- Objective: verify local `/ai/ping` after API key replacement.
- Scope:
  - run protected ping on active local dev port
  - confirm successful Worker → OpenAI JSON response
- Commands run:
  - `curl.exe -sS -H "cf-access-jwt-assertion: devuser-local-token" http://127.0.0.1:8976/ai/ping`
- Files changed:
  - `RUNNING_LOG.md`
- Results:
  - `/ai/ping` returned `ok: true` with model + structured output payload.
  - Local key replacement validated.
- Attempts and fails:
  - Attempts: 2
  - Fails: 1 (initial call before local worker was running)

### Session: Slice 4.4 Live Specialist v0 (CATALYST only)

- Task ID: SK-2026-02-24-01
- Timestamp: 2026-02-24 04:27 local
- Objective: enable exactly one live specialist (`CATALYST`) via OpenAI while keeping all other specialists mocked and preserving existing contracts/endpoints/tests.
- Scope:
  - add env-controlled specialist generator module for CATALYST-only rollout
  - keep `/council` and `/decisions/:id` surfaces unchanged
  - avoid schema and contract-pack drift
  - preserve deterministic tests with explicit mock bindings
- Commands run:
  - `npx wrangler types`
  - `npm test -- --run` (failed once)
  - `npm test -- --run` (passed after fixes)
- Files changed:
  - `src/specialists/generate.ts` (new)
  - `src/specialists/interact.ts`
  - `src/index.ts`
  - `wrangler.jsonc`
  - `.dev.vars`
  - `test/.dev.vars`
  - `vitest.config.mts`
  - `worker-configuration.d.ts` (regenerated)
- Results:
  - Added `USE_LIVE_SPECIALISTS` + `OPENAI_MODEL` vars in `wrangler.jsonc`.
  - Added CATALYST-only live gate: OpenAI is used only when `USE_LIVE_SPECIALISTS=true` and `specialist.id === "CATALYST"`.
  - All non-CATALYST specialists remain mocked through existing mock stance generator.
  - Added explicit request metadata + dev observability log line: `STANCE_GEN CATALYST openai`.
  - Preserved no-test-breakage by honoring `USE_MOCK_SPECIALISTS=true` as hard override and forcing `USE_LIVE_SPECIALISTS=false` in test bindings.
  - Full suite restored and passing: 18 tests, 0 failed.
  - Local acceptance check (`/council`, Catalyst-triggering goal) succeeded with live CATALYST path:
    - `request_id = b0b92588-073e-41d6-be96-5a6f3e400619`
    - `decision_id = dc7eaf76-68dd-488a-83dd-0ffd6269ccec`
    - selected specialists: `ARCHIVIST,NARRATIVE,CATALYST`
    - specialist stances include `CATALYST` (live) plus mocked governance stances
    - worker console evidence: `STANCE_GEN CATALYST openai`
- Attempts and fails:
  - Attempt 1 failed because Responses API rejected `response_format` (`400`, moved to `text.format`).
  - Fixed by adding compatibility fallback: first try `response_format: json_schema`, then retry with `text.format` if API requests migration.
- Open questions:
  - none
- Next action:
  - optional: add a tiny helper script to emit a standardized acceptance evidence block into `RUNNING_LOG.md` after each manual smoke run.

### Session: Slice 4.4.1 Hardening Pass (Live CATALYST path)

- Task ID: SK-2026-02-24-02
- Timestamp: 2026-02-24 04:45 local
- Objective: harden live-specialist path without contract/schema/endpoint drift and preserve deterministic test behavior.
- Scope:
  - isolate OpenAI format negotiation into single-responsibility helpers
  - add machine-verifiable live-use console assertion
  - pin model fallback + warning for missing `OPENAI_MODEL`
  - add request timeout guard for live OpenAI calls
  - map live-call failures into stable `/council` envelope errors
- Commands run:
  - `npm test -- --run`
  - `curl -sS -H "content-type: application/json" -H "cf-access-jwt-assertion: devuser-local-token" http://127.0.0.1:8787/council -d '{"goal":"Catalyst: brainstorm a plan for relic generator integration, options network, constraints-aware."}' | python -c "..."`
- Files changed:
  - `src/specialists/generate.ts`
  - `src/index.ts`
  - `RUNNING_LOG.md`
- Results:
  - `generate.ts` now separates concerns via:
    - `tryJsonSchemaFormat(...)`
    - `tryTextFormatJsonSchema(...)`
    - `parseStanceOrFail(...)`
  - Added 12s timeout guard using `AbortController`; timeout now throws `openai_timeout`.
  - Added model hardening: missing `OPENAI_MODEL` logs once and defaults to `gpt-4o-mini`.
  - Added machine-verifiable runtime assertion log after successful live generation:
    - `LIVE_SPECIALISTS_USED=["CATALYST"] request_id=<id>`
  - `/council` now catches tiered live-call errors and returns envelope-safe errors:
    - `openai_timeout` (502)
    - `openai_failed` (502)
  - Regression status unchanged: 18 tests passed, 0 failed.
  - Post-hardening smoke evidence:
    - `request_id = f4566fe5-5288-46d7-a021-2a1d4ef7a6b6`
    - selected specialists include `ARCHIVIST,NARRATIVE,CATALYST`
- Attempts and fails:
  - Attempts: 1
  - Fails: 0
- Open questions:
  - none
- Next action:
  - optional: add a tiny scripted smoke harness that captures the new `LIVE_SPECIALISTS_USED` line and appends a preformatted evidence block to this log.

### Session: Live Eligibility Expansion (CATALYST + SPECTRA)

- Task ID: SK-2026-02-25-01
- Timestamp: 2026-02-25 local
- Objective: expand live specialist eligibility to include `SPECTRA` while preserving `MAX_LIVE_SPECIALISTS` cap behavior and deterministic ordering.
- Scope:
  - minimal gate changes only (no contract/schema drift)
  - thread `MAX_LIVE_SPECIALISTS` through `/council` runtime env
- Commands run:
  - none (code edit only)
- Files changed:
  - `src/specialists/interact.ts`
  - `src/specialists/generate.ts`
  - `src/index.ts`
  - `RUNNING_LOG.md`
- Results:
  - Live-eligible specialist set is now `CATALYST` + `SPECTRA`.
  - `MAX_LIVE_SPECIALISTS` remains dominant in stage generation cap logic.
  - `src/index.ts` now passes `MAX_LIVE_SPECIALISTS` into `runTieredCouncil(...)`, fixing runtime env threading.
  - `SPECTRA` registry entry already existed with UI/UX trigger keywords; no schema change required.
- Attempts and fails:
  - Attempts: 1
  - Fails: 0
- Test status:
  - Not run in this change pass.
- Open questions:
  - none
- Next action:
  - run targeted `/council` smoke with `USE_LIVE_SPECIALISTS=true` and `MAX_LIVE_SPECIALISTS=1/2` to verify cap behavior across `CATALYST` + `SPECTRA`.

### Session: Manual Acceptance Smoke (CATALYST + SPECTRA trigger goal)

- Task ID: SK-2026-02-25-02
- Timestamp: 2026-02-25 local
- Objective: manually verify specialist selection and live-cap behavior using a goal that triggers both `CATALYST` and `SPECTRA`.
- Scope:
  - call protected `POST /council` on active local worker
  - inspect `selected_specialists` and propose stances for cap behavior evidence
- Commands run:
  - `Invoke-RestMethod -Method Post http://127.0.0.1:8787/council` (with devuser auth header and JSON body)
- Files changed:
  - `RUNNING_LOG.md`
- Results:
  - Local worker confirmed active on `127.0.0.1:8787`.
  - Request succeeded (`ok: true`).
  - request_id: `cc8a821b-e040-4e13-8f81-5092a584c48b`
  - decision_id: `01eceaca-d245-4338-b3c0-14ecab5218bb`
  - `selected_specialists` included expected IDs: `ARCHIVIST`, `SPECTRA`, `CATALYST`
  - Additional valid trigger matches also selected: `NARRATIVE` (via `relic`) and `HERMES` (via `branching`)
  - Propose stage order observed: `SPECTRA`, `HERMES`, `CATALYST` (deterministic roster order preserved)
  - With `MAX_LIVE_SPECIALISTS` unset (defaults to `1`), response evidence indicates only one live specialist was used:
    - `SPECTRA` stance was rich/generated (live-like)
    - `CATALYST` stance matched mock pattern ("Prefer a smaller scope cut..." / generic mock fields)
  - This matches expected cap-dominant behavior for `USE_LIVE_SPECIALISTS=true` + implicit `MAX_LIVE_SPECIALISTS=1`.
- Attempts and fails:
  - Attempts: 2
  - Fails: 1 (initial PowerShell `curl` quoting error caused `invalid_json`)
- Test status:
  - Manual acceptance smoke passed (response-level verification)
  - Console log verification not captured in this session because the local worker is running in a separate process/terminal (`workerd.exe` on port 8787).
- Open questions:
  - none
- Next action:
  - set `MAX_LIVE_SPECIALISTS=2` and rerun the same goal while observing Wrangler console to confirm both `STANCE_GEN CATALYST openai` and `STANCE_GEN SPECTRA openai`.

### Session: Stability Pass (CATALYST + SPECTRA coexistence, pre-Slice 4.7)

- Task ID: SK-2026-02-25-03
- Timestamp: 2026-02-25 local
- Objective: verify `CATALYST` + `SPECTRA` coexist cleanly (latency, format behavior, schema/contract stability) before attempting Slice 4.7.
- Scope:
  - repeated manual `/council` calls with dual-trigger goal on live local worker
  - regression suite run for schema/contract/test confidence
- Commands run:
  - repeated `Invoke-RestMethod POST http://127.0.0.1:8787/council` (6 runs, devuser auth)
  - `npm.cmd test -- --run`
- Files changed:
  - `RUNNING_LOG.md`
- Results:
  - Manual repeated smoke (`6/6`) succeeded with `ok: true` on all runs.
  - Selection remained stable across runs:
    - `ARCHIVIST,NARRATIVE,SPECTRA,HERMES,CATALYST`
  - Propose-stage ordering remained stable (registry/selection order):
    - `SPECTRA`, `HERMES`, `CATALYST`
  - Cap behavior remained stable with implicit default `MAX_LIVE_SPECIALISTS=1`:
    - `SPECTRA` response content appeared live-generated
    - `CATALYST` remained mock-patterned
  - Latency (6 runs):
    - min: `3913ms`
    - max: `7538ms`
    - avg: `5767.5ms`
  - No error envelopes, no invalid stance shape behavior, and no `/council` schema surprises observed in response payloads during repeated runs.
  - Regression suite passed:
    - `18` tests passed
    - `0` failed
- Attempts and fails:
  - Attempts: 1 stability pass
  - Fails: 0
- Test status:
  - Manual acceptance smoke loop: passed (`6/6`)
  - Automated regression suite: passed (`18/18`)
- Open questions:
  - Direct runtime confirmation of `FORMAT_MODE` migration warning/no-oscillation was not captured because the active local worker console was attached to a separate terminal/process.
- Next action:
  - For explicit format-mode evidence, rerun under an attached Wrangler terminal and confirm `FORMAT_MODE set to text.format...` appears at most once per fresh worker process; then proceed to Slice 4.7.

### Session: Deterministic Live Evidence Log Line (/council)

- Task ID: SK-2026-02-25-04
- Timestamp: 2026-02-25 local
- Objective: emit one grep-able live-specialist summary line per successful `/council` request.
- Scope:
  - add end-of-request summary log with `request_id` + `decision_id`
  - avoid duplicate `LIVE_SPECIALISTS_USED` prefix matches from per-specialist logs
- Commands run:
  - none (code edit only)
- Files changed:
  - `src/index.ts`
  - `src/specialists/generate.ts`
  - `RUNNING_LOG.md`
- Results:
  - Added deterministic `/council` success log line:
    - `LIVE_SPECIALISTS_USED=[...] request_id=<id> decision_id=<id>`
  - Summary line is computed from selected roster order + env gates + `MAX_LIVE_SPECIALISTS` cap (deterministic and grep-friendly).
  - Renamed per-specialist generation log from `LIVE_SPECIALISTS_USED=...` to `LIVE_SPECIALIST_USED=...` to preserve a single truth line per request for grep.
  - Existing `STANCE_GEN <ID> openai` lines remain unchanged.
- Attempts and fails:
  - Attempts: 1
  - Fails: 0
- Test status:
  - Not run in this change pass.
- Open questions:
  - none
- Next action:
  - run one manual `/council` smoke while attached to Wrangler console and confirm the new summary line prints once per successful request.

### Session: Attached-Console Verification Attempt (MAX_LIVE_SPECIALISTS=2)

- Task ID: SK-2026-02-25-05
- Timestamp: 2026-02-25 local
- Objective: capture attached Wrangler console evidence for dual-live run (`SPECTRA` + `CATALYST`) with `MAX_LIVE_SPECIALISTS=2`.
- Scope:
  - run `wrangler dev` on `:8787` with `MAX_LIVE_SPECIALISTS=2`
  - issue dual-trigger `/council` request and inspect console logs for:
    - `STANCE_GEN SPECTRA openai`
    - `STANCE_GEN CATALYST openai`
    - `LIVE_SPECIALISTS_USED=[...] request_id=... decision_id=...`
    - optional one-time `FORMAT_MODE` flip warning
- Commands run:
  - attempted foreground `npx.cmd wrangler dev --port 8787` / `wrangler.cmd dev --port 8787 --log-level debug`
  - attempted background log-capture launch + manual `/council` request
- Files changed:
  - `RUNNING_LOG.md`
- Results:
  - Foreground Wrangler startup could not be stably observed in this shell wrapper:
    - `wrangler dev` timed out under tool control
    - `wrangler.cmd --log-level debug` surfaced `EPIPE: broken pipe, write` when tool timeout cut the process pipe
  - Background launch workaround successfully started Wrangler and showed `Ready on http://127.0.0.1:8787` with `env.MAX_LIVE_SPECIALISTS` present in bindings, but requests to the local server hung in this execution environment.
  - As a result, attached-console proof for dual-live `STANCE_GEN` lines and format-cache behavior was **not captured** in this session.
  - Cleaned up temporary local listener on `:8787` after the attempt.
- Attempts and fails:
  - Attempts: 1 verification session (multiple launch methods)
  - Fails: 1 environment/tooling blocker (attached interactive Wrangler logs not capturable here)
- Test status:
  - Verification attempt blocked (no pass/fail result for the requested console evidence)
- Open questions:
  - none (blocker is this tool wrapper behavior, not repo logic)
- Next action:
  - run the exact PowerShell request in a user-attached terminal with foreground `npx wrangler dev` and `MAX_LIVE_SPECIALISTS=2`, then append captured console evidence lines to this log.

### Session: Attached-Console Evidence (Observed No Live Specialists Used)

- Task ID: SK-2026-02-25-06
- Timestamp: 2026-02-25 local
- Objective: capture real Wrangler console evidence for `/council` under attached run.
- Scope:
  - inspect live-specialist summary log line and request timing
- Commands run:
  - attached `wrangler dev` on `:8787`
  - manual `POST /council` (user-run)
- Files changed:
  - `RUNNING_LOG.md`
- Results:
  - Captured attached console evidence:
    - `[wrangler:info] Ready on http://127.0.0.1:8787`
    - `METHOD: POST`
    - `PATH: /council`
    - `LIVE_SPECIALISTS_USED=[] request_id=a58eeca3-dd48-4356-a33d-f15bf1e0b16f decision_id=10cd41bf-013c-4a84-bb3e-7ac7bf4575dd`
    - `[wrangler:info] POST /council 200 OK (42ms)`
  - Interpretation:
    - Request reached `/council` successfully.
    - New deterministic summary log line is working.
    - No live specialists were used on this request (`[]`), so dual-live proof was **not** achieved.
    - `42ms` strongly suggests fully mocked execution (no OpenAI calls).
- Attempts and fails:
  - Attempts: 1 attached request run
  - Fails: 1 expected verification miss (no live specialists activated)
- Test status:
  - Manual console evidence captured (but not the expected dual-live case)
- Open questions:
  - Was the submitted goal the intended dual-trigger goal (`SPECTRA` + `CATALYST`)?
  - Were `USE_LIVE_SPECIALISTS=true`, `USE_MOCK_SPECIALISTS=false`, and `MAX_LIVE_SPECIALISTS=2` all active in the same Wrangler process?
- Next action:
  - inspect the actual `/council` response `selected_specialists` for this request and verify active env values in the Wrangler shell, then rerun once for dual-live proof.

### Session: Attached-Terminal Dual-Live Proof + Format Cache Check

- Task ID: SK-2026-03-03-01
- Timestamp: 2026-03-03 local
- Objective:
  - prove `SPECTRA` and `CATALYST` both go live in one attached-terminal run with cap=2
  - verify format-mode cache behavior across consecutive requests
- Scope:
  - run local `wrangler dev` with live gates enabled and propose cap set to 2
  - send dual-trigger `/council` requests and inspect attached terminal output
  - apply minimal env-threading fix needed for per-stage caps to take effect
- Commands run:
  - `npx wrangler dev --port 8976 --var USE_LIVE_SPECIALISTS:true --var USE_MOCK_SPECIALISTS:false --var MAX_LIVE_SPECIALISTS_PROPOSE:2 --var MAX_LIVE_SPECIALISTS_REVIEW:0`
  - `curl -sS -X POST http://127.0.0.1:8976/council ...` (dual-trigger goal; run twice)
  - `npm test -- --run`
- Files changed:
  - `src/index.ts`
  - `src/specialists/interact.ts`
  - `RUNNING_LOG.md`
- Results:
  - Attached terminal captured both live propose specialists on the same request:
    - `STANCE_GEN SPECTRA propose openai`
    - `STANCE_GEN CATALYST propose openai`
  - First request emitted migration warning logs:
    - `FORMAT_MODE set to text.format after migration error` (seen during initial fallback)
  - Second immediate request emitted no format-mode warning, indicating cache stayed on fallback mode and did not oscillate request-to-request.
  - `/council` returned `502` with `governance_unsatisfied` in this run; this did not block live-generation proof capture.
  - Minimal runtime fix applied: threaded `MAX_LIVE_SPECIALISTS_PROPOSE` / `MAX_LIVE_SPECIALISTS_REVIEW` from `src/index.ts` into `runTieredCouncil(...)` env.
- Attempts and fails:
  - Attempts: 2 request runs
  - Fails: 0 for live-proof objective
- Test status:
  - `npm test -- --run` failed in current local test env due `/council` calls returning `502` (`governance_unsatisfied`) in several integration tests.
- Open questions:
  - none
- Next action:
  - stabilize governance satisfaction path under test/live config split, then rerun full suite and append pass/fail closure block.

### Session: Slice 4.7 — Live Review-Tier v0 (ARCHITECT only)

- Task ID: SK-2026-02-25-04
- Timestamp: 2026-03-03 local
- Objective:
  - enable exactly one review-tier live specialist (`ARCHITECT`) via OpenAI
  - preserve propose-tier live behavior (`CATALYST`/`SPECTRA`) and deterministic tests
- Scope:
  - keep tiered governance enforcement, endpoint envelopes, D1 schema/tables, and contracts/schemas stable
  - enforce stage-aware live eligibility with separate propose/review caps
  - enforce deterministic test env (`USE_LIVE_SPECIALISTS=false`, `USE_MOCK_SPECIALISTS=true`)
- Commands run:
  - `npm test -- --run`
  - `npm test -- --run`
  - `npm test -- --run`
- Files changed:
  - `src/specialists/generate.ts`
  - `src/specialists/interact.ts`
  - `src/specialists/mock.ts`
  - `.dev.vars`
  - `test/.dev.vars`
  - `RUNNING_LOG.md`
- Results:
  - Stage-aware live gating is now single-source from `interact.ts` (propose: `CATALYST`/`SPECTRA`, review: `ARCHITECT`).
  - `generate.ts` no longer carries a conflicting hardcoded live ID set; it obeys env live/mock toggles provided by stage gate logic.
  - Local dev vars now explicitly express Slice 4.7 intent:
    - `USE_LIVE_SPECIALISTS=true`
    - `USE_MOCK_SPECIALISTS=false`
    - `MAX_LIVE_SPECIALISTS_PROPOSE=2`
    - `MAX_LIVE_SPECIALISTS_REVIEW=1`
  - Test vars now enforce deterministic offline behavior:
    - `USE_LIVE_SPECIALISTS=false`
    - `USE_MOCK_SPECIALISTS=true`
    - `MAX_LIVE_SPECIALISTS_PROPOSE=0`
    - `MAX_LIVE_SPECIALISTS_REVIEW=0`
  - Runtime artifact shape was normalized to existing schema by stripping internal `required_changes` evidence fields from emitted review stage artifacts.
  - Final verification: full suite passed (`18/18`).
- Attempts and fails:
  - Initial verification exposed deterministic governance mismatch and one schema-shape mismatch; both resolved in-scope.
- Open questions:
  - none
- Next action:
  - run one attached-terminal smoke with review-triggering goal to capture explicit `STANCE_GEN ARCHITECT review openai` evidence under live mode.

### Session: Slice 4.7 — Review Framing + Live Review Observability

- Task ID: SK-2026-02-25-04
- Timestamp: 2026-03-03 local
- Objective:
  - confirm review framing signals are explicit and stance-shape stable
  - add/verify server-only observability lines for stage live usage
  - capture attached-console evidence for propose + review live traces
- Scope:
  - no schema changes
  - no contract-pack changes
  - no endpoint/response shape drift
- Commands run:
  - `npm test -- --run`
  - `npx wrangler dev --port 8976 --var USE_LIVE_SPECIALISTS:true --var USE_MOCK_SPECIALISTS:false --var MAX_LIVE_SPECIALISTS_PROPOSE:2 --var MAX_LIVE_SPECIALISTS_REVIEW:1`
  - `curl -sS -X POST http://127.0.0.1:8976/council ...` (architecture/api/data + ui + alternatives goal)
  - `npx wrangler dev --port 8976 --var USE_LIVE_SPECIALISTS:true --var USE_MOCK_SPECIALISTS:false --var MAX_LIVE_SPECIALISTS_PROPOSE:0 --var MAX_LIVE_SPECIALISTS_REVIEW:1`
  - `curl -sS -X POST http://127.0.0.1:8976/council ...` (review-relevant goal)
- Files changed:
  - `src/specialists/interact.ts`
  - `src/index.ts`
  - `schemas/specialists/specialists.v1.json`
  - `RUNNING_LOG.md`
- Results:
  - Review framing already contained the requested signals in `makeCaptainFrame(...)`:
    - `Stage: review`
    - decision card summary (goal + constraints)
    - propose digest bullets (role, stance, top risks)
    - explicit governance instruction to express gaps via asks/proposed_changes
    - stance JSON shape unchanged
  - Added review-tier specialist selection path by introducing `ARCHITECT` as a review-tier keyword specialist.
  - Updated tier split to tier-driven classification (`propose` vs `review`) so selected review specialists can participate in review stage.
  - Added server log summary line in tiered runtime:
    - `LIVE_USED propose=[...] review=[...] request_id=... decision_id=...`
  - Automated suite remains deterministic and passing: `18/18`.
  - Attached-console evidence captured:
    - `STANCE_GEN SPECTRA propose openai`
    - `STANCE_GEN CATALYST propose openai`
    - `STANCE_GEN ARCHITECT review openai`
  - Manual calls returned `openai_failed: missing_openai_api_key` in this environment, so a single all-live request proof and successful live review payload could not be completed here.
- Open questions:
  - none (operational precondition only: local key must be present for end-to-end live success proof)
- Next action:
  - rerun one attached request with `OPENAI_API_KEY` present and caps `propose=2/review=1` to capture all `STANCE_GEN` lines + `LIVE_USED propose/review` in one successful run.

### Session: Slice 4.7 Attached Proof Closure (Key Load + Full Live Traces)

- Task ID: SK-2026-02-25-04
- Timestamp: 2026-03-03 local
- Objective:
  - resolve `.dev.vars` key-load inconsistency
  - capture one attached run with live traces for `SPECTRA`, `CATALYST`, and `ARCHITECT`
- Scope:
  - runtime/config hygiene only; no schema or contract changes
- Commands run:
  - normalized `.dev.vars` formatting (preserved existing key value)
  - `npx wrangler dev --port 8976 --var USE_LIVE_SPECIALISTS:true --var USE_MOCK_SPECIALISTS:false --var MAX_LIVE_SPECIALISTS_PROPOSE:2 --var MAX_LIVE_SPECIALISTS_REVIEW:1`
  - `curl -sS -X POST http://127.0.0.1:8976/council ...` (review-relevant goal)
  - `curl -sS -X POST http://127.0.0.1:8976/council ...` (ui + alternatives + architecture goal)
- Files changed:
  - `.dev.vars`
  - `RUNNING_LOG.md`
- Results:
  - Root cause identified: malformed/duplicated `.dev.vars` content caused inconsistent key detection despite apparent editor content.
  - `.dev.vars` now canonicalized with valid standalone `OPENAI_API_KEY` line.
  - Attached evidence captured (single request) for all requested live traces:
    - `STANCE_GEN SPECTRA propose openai`
    - `STANCE_GEN CATALYST propose openai`
    - `STANCE_GEN ARCHITECT review openai`
  - Attached summary evidence captured:
    - `LIVE_USED propose=["SPECTRA","CATALYST"] review=["ARCHITECT"] request_id=... decision_id=...`
  - Request returned `governance_unsatisfied` (expected acceptable outcome for strong live review output).
- Open questions:
  - none
- Next action:
  - proceed to Slice 4.8 captain satisfaction logic tuning (without weakening governance).

### Session: Slice 4.8 — Governance Satisfaction v1 (Deterministic RC Coverage)

- Task ID: SK-2026-02-25-05
- Timestamp: 2026-03-03 local
- Objective:
  - make required_changes -> satisfies_required_changes coverage deterministic, auditable, and explicit under live/mocked review variance
- Scope:
  - no endpoint surface changes
  - no D1 table/schema changes
  - keep council artifact schema compatibility (`required_changes` shape unchanged externally)
- Commands run:
  - docs refresh: Cloudflare Workers + platform limits pages
  - `npm test -- --run test/index.spec.ts`
- Files changed:
  - `src/specialists/interact.ts`
  - `src/index.ts`
  - `test/index.spec.ts`
  - `RUNNING_LOG.md`
- Results:
  - RC normalization is now deterministic via `normalizeRequiredChange(...)`:
    - stable `evidence_kind` inference
    - stable `evidence_match` derivation
    - stable numeric id generation `RC-<fnv1a_uint32>` from role/type/evidence tuple
  - RC extraction now de-duplicates by deterministic id and sorts output for audit stability.
  - Satisfaction evaluation now uses explicit corpus matching against decision card sections with canonicalized matching (`_`/`-`/punctuation tolerant).
  - Runtime emits explicit governance evaluation logs:
    - `GOVERNANCE_EVAL required=<n> satisfied=<n> missing=[...] request_id=... decision_id=...`
  - `/council` now classifies thrown `governance_unsatisfied` correctly as `500 governance_unsatisfied` (instead of `502 openai_failed`).
  - Added deterministic tests for RC evidence coverage:
    - missing `rate_limit` token -> `500 governance_unsatisfied` + runs row reflects failure
    - adding `rate_limit` evidence -> successful `200` path
  - Validation: `test/index.spec.ts` passed (`16/16`).
- Open questions:
  - none
- Next action:
  - run one attached live review request and capture `GOVERNANCE_EVAL` + `LIVE_USED propose/review` lines in the same console proof block.

### Session: Slice 4.8 — Attached Live Proof (Governance Eval + Live Used)

- Task ID: SK-2026-02-25-05
- Timestamp: 2026-03-03 local
- Objective:
  - capture attached-console proof showing `LIVE_USED propose/review` and `GOVERNANCE_EVAL` in the same live `/council` request
- Scope:
  - no code changes
  - runtime evidence capture only
- Commands run:
  - `npx wrangler dev --port 8987 --var USE_LIVE_SPECIALISTS:true --var USE_MOCK_SPECIALISTS:false --var MAX_LIVE_SPECIALISTS_PROPOSE:2 --var MAX_LIVE_SPECIALISTS_REVIEW:1`
  - `curl -sS -X POST http://127.0.0.1:8987/council -H "content-type: application/json" -H "cf-access-jwt-assertion: devuser-local-token" --data '{"goal":"architecture api contracts data model governance ui ux flow alternatives strategy branching"}'`
- Files changed:
  - `RUNNING_LOG.md`
- Results:
  - Attached stage evidence captured:
    - `STANCE_GEN SPECTRA propose openai`
    - `STANCE_GEN CATALYST propose openai`
    - `STANCE_GEN ARCHITECT review openai`
  - Attached summary evidence captured:
    - `LIVE_USED propose=["SPECTRA","CATALYST"] review=["ARCHITECT"] request_id=ff350b63-4861-4352-a7aa-35f04a82fb39 decision_id=a2284286-edcc-408a-a2c4-9f2a759f8d54`
  - Attached deterministic governance evidence captured:
    - `GOVERNANCE_EVAL required=4 satisfied=1 missing=["RC-2672656666","RC-2958053822","RC-8611784"] request_id=ff350b63-4861-4352-a7aa-35f04a82fb39 decision_id=a2284286-edcc-408a-a2c4-9f2a759f8d54`
  - Request returned:
    - `500 governance_unsatisfied` with missing RC ids in error detail (expected strict-governance behavior)
- Open questions:
  - none
- Next action:
  - proceed to Slice 4.9 only if you want softer review prompts or stronger RC evidence-token extraction; governance core is now deterministic and auditable.

## Logging Template (Append Below)

### Session: <short name>

- Task ID: <e.g. SK-2026-02-22-01>
- Timestamp: <YYYY-MM-DD HH:MM local>
- Objective:
- Scope:
- Commands run:
- Files changed:
- Results:
- Open questions:
- Next action:
