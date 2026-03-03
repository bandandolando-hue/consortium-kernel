# Consortium Kernel Working Playbook

Purpose: run sessions with low drift and ship vertical slices that are testable.

## Session Start (2 minutes)

1. Set objective (single sentence)
   - Example: "Slice 0 returns JSON at GET / with request_id"
2. Declare authority level
   - Exploratory | Draft | Canonical
3. Lock scope
   - In-scope: files/routes touched
   - Out-of-scope: everything else
4. Confirm constraints
   - API is authority, server-side permissions, no canon invention, no bypasses

## Cloudflare Worker Baseline

1. Ensure current docs are checked before platform decisions
   - https://developers.cloudflare.com/workers/
2. Initialize local D1 schema (fresh machine / reset state)
   - `npm run db:init`
3. Start local worker
   - `npm run dev` or `npx wrangler dev`
4. Verify root health endpoint
   - `curl -i http://127.0.0.1:8787/`

## First Run / Recovery Sequence

Run this exact order when local runtime is unstable or after pulling fresh changes:

1. `npm install`
2. `npm run db:init`
3. `npm run dev`
4. In a second terminal:
   - `curl -i http://127.0.0.1:8787/`
   - `curl -i http://127.0.0.1:8787/council`
   - `curl -i -X POST http://127.0.0.1:8787/council -H "content-type: application/json" -d '{"goal":"smoke test"}'`
5. Log outcome in `RUNNING_LOG.md`

Expected Slice 0 response:

```json
{
  "ok": true,
  "service": "consortium-kernel",
  "request_id": "<uuid>"
}
```

## 404 Triage Flow (Fast)

1. Check method + path
   - Must be `GET /` for Slice 0
2. Check route normalization
   - Normalize trailing slashes before route matching
3. Check for accidental early returns
   - No unconditional `return` before routing branches
4. Check worker entrypoint
   - `wrangler.jsonc` `main` points to `src/index.ts`
5. Re-test with explicit host/port
   - `curl -i http://127.0.0.1:8787/`

## Slice Gate (Definition of Done)

A slice is complete only when all are true:

- Endpoint behavior matches contract
- Request includes `request_id`
- Tests updated and passing for changed behavior
- One repeatable curl check documented

## Session End Handoff

- What changed
- Open questions
- Next action (single concrete step)
- Update `RUNNING_LOG.md` with timestamped status
