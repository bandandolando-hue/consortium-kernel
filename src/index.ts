import { selectSpecialists, type SpecialistEntry } from "./specialists/select";
import { type SpecialistStance, validateSpecialistStance } from "./specialists/schemas";
import { runTieredCouncil } from "./specialists/interact";

type Env = {
  DB: D1Database;
  OPENAI_API_KEY?: string;
  USE_LIVE_SPECIALISTS?: string;
  MAX_LIVE_SPECIALISTS?: string;
  MAX_LIVE_SPECIALISTS_PROPOSE?: string;
  MAX_LIVE_SPECIALISTS_REVIEW?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
  ACCESS_PROTECTION_ENABLED?: string;
  DEVUSER_ACCESS_JWT?: string;
  SERVICE_TOKEN_ID?: string;
  SERVICE_TOKEN_SECRET?: string;
  USE_MOCK_SPECIALISTS?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type OkResponse<T> = { ok: true; data: T; request_id: string };
type ErrResponse = { ok: false; error: { code: string; detail?: string }; request_id: string };
type SeatRole = "ARCHIVIST" | "ARCHITECT" | "BUILDER" | "UX" | "GATEKEEPER";
type QuorumSeatStance = {
  role: SeatRole;
  stance: string;
  risks: string[];
  asks: string[];
  proposed_changes: string[];
};
type DecisionCard = {
  goal: string;
  constraints: string[];
  plan: string[];
  acceptance_tests: string[];
  definition_of_done: string[];
};
const LIVE_SPECIALIST_IDS = new Set(["CATALYST", "SPECTRA"]);

function ok<T>(data: T, requestId: string, status = 200) {
  return json({ ok: true, data, request_id: requestId } satisfies OkResponse<T>, status);
}

function fail(code: string, requestId: string, status: number, detail?: string) {
  const payload: ErrResponse = { ok: false, error: { code }, request_id: requestId };
  if (detail) payload.error.detail = detail;
  return json(payload, status);
}

function html(content: string, status = 200) {
  return new Response(content, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function buildQuorum(goal: string): QuorumSeatStance[] {
  return [
    {
      role: "ARCHIVIST",
      stance: `Preserve the council packet as a stable canonical artifact for goal "${goal}" and keep readback mirrored.`,
      risks: ["schema drift", "incomplete decision metadata"],
      asks: ["keep artifact keys stable", "keep request_id on all responses"],
      proposed_changes: ["store council and decision_card together", "avoid duplicate task representations"],
    },
    {
      role: "ARCHITECT",
      stance: "Use one compact decision_card format with explicit constraints, plan, acceptance_tests, and definition_of_done.",
      risks: ["breaking consumers expecting legacy keys"],
      asks: ["keep endpoint payloads mirrored", "keep envelope shape stable"],
      proposed_changes: ["remove non-essential card fields", "derive tasks from plan steps"],
    },
    {
      role: "BUILDER",
      stance: "Generate a practical plan and persist task rows from that plan as the execution truth.",
      risks: ["task/card mismatch"],
      asks: ["one task row per plan step", "todo status on creation"],
      proposed_changes: ["map plan[] to tasks table rows", "keep DB writes atomic in council flow"],
    },
    {
      role: "UX",
      stance: "Keep the output readable and deterministic so the room can render without interpretation logic.",
      risks: ["state handling ambiguity"],
      asks: ["uniform council stance fields", "decision card sections always present"],
      proposed_changes: ["render plan as ordered steps", "show acceptance_tests and definition_of_done directly"],
    },
    {
      role: "GATEKEEPER",
      stance: "Protect endpoints and keep observability intact while changing payload shape.",
      risks: ["misconfigured auth defaults"],
      asks: ["deny on missing auth config", "log route outcomes in runs"],
      proposed_changes: ["keep fail-closed auth checks", "retain request_id on all error paths"],
    },
  ];
}

function buildDecisionCard(goal: string): DecisionCard {
  const constraints = ["vertical_slice_only", "internal_access_only", "canonical_task_table"];
  const plan = [
    "Synthesize five council stances into one coherent direction",
    "Bind direction into decision_card sections for direct execution",
    "Persist plan-derived tasks to tasks table and verify mirrored readback",
  ];
  const acceptanceTests = [
    "council contains all 5 role stances",
    "decision_card includes constraints, acceptance_tests, definition_of_done",
    "tasks persisted in tasks table match decision_card plan steps",
  ];
  const definitionOfDone = [
    "POST /council returns council, decision_card, and tasks",
    "GET /decisions/:id mirrors the same payload structure",
    "runs table logs request outcomes for protected routes",
  ];

  return {
    goal,
    constraints,
    plan,
    acceptance_tests: acceptanceTests,
    definition_of_done: definitionOfDone,
  };
}

function roomPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Consortium Room</title>
</head>
<body>
  <main>
    <h1>Consortium Room</h1>
    <p id="state">idle</p>
    <label for="goal">Goal</label>
    <input id="goal" name="goal" type="text" />
    <button id="submit">Submit to /council</button>

    <section id="result" hidden>
      <p><strong>decision_id:</strong> <span id="decisionId"></span></p>
      <p><strong>request_id:</strong> <span id="requestId"></span></p>
      <ul id="tasks"></ul>
      <button id="copyDebug">Copy debug info</button>
      <pre id="debug"></pre>
    </section>

    <section id="error" hidden>
      <p id="errorText"></p>
      <p><strong>request_id:</strong> <span id="errorRequestId"></span></p>
    </section>
  </main>

  <script>
    const stateEl = document.getElementById('state');
    const goalEl = document.getElementById('goal');
    const submitEl = document.getElementById('submit');
    const resultEl = document.getElementById('result');
    const errorEl = document.getElementById('error');
    const decisionIdEl = document.getElementById('decisionId');
    const requestIdEl = document.getElementById('requestId');
    const tasksEl = document.getElementById('tasks');
    const debugEl = document.getElementById('debug');
    const copyDebugEl = document.getElementById('copyDebug');
    const errorTextEl = document.getElementById('errorText');
    const errorRequestIdEl = document.getElementById('errorRequestId');

    let debugPayload = null;

    function setState(nextState) {
      stateEl.textContent = nextState;
      if (nextState === 'loading') {
        submitEl.disabled = true;
      } else {
        submitEl.disabled = false;
      }
    }

    function resetPanels() {
      resultEl.hidden = true;
      errorEl.hidden = true;
      tasksEl.innerHTML = '';
      debugEl.textContent = '';
      debugPayload = null;
    }

    submitEl.addEventListener('click', async () => {
      const goal = goalEl.value.trim();
      resetPanels();

      if (!goal) {
        setState('error');
        errorEl.hidden = false;
        errorTextEl.textContent = 'Goal is required.';
        errorRequestIdEl.textContent = '';
        return;
      }

      setState('loading');

      const headers = { 'content-type': 'application/json' };

      try {
        const response = await fetch('/council', {
          method: 'POST',
          headers,
          body: JSON.stringify({ goal }),
        });

        const payload = await response.json();

        if (!response.ok) {
          setState('error');
          errorEl.hidden = false;
          errorTextEl.textContent = payload?.error?.code || 'request_failed';
          errorRequestIdEl.textContent = payload.request_id || '';
          return;
        }

        const successData = payload?.data || {};

        setState('success');
        resultEl.hidden = false;
        decisionIdEl.textContent = successData.decision_id || '';
        requestIdEl.textContent = payload.request_id || '';

        const tasks = Array.isArray(successData.tasks) ? successData.tasks : [];
        for (const task of tasks) {
          const li = document.createElement('li');
          li.textContent = String(task.description) + ' (' + String(task.status) + ')';
          tasksEl.appendChild(li);
        }

        debugPayload = {
          request_id: payload.request_id || '',
          route: '/council',
          timestamp: new Date().toISOString(),
        };
        debugEl.textContent = JSON.stringify(debugPayload, null, 2);
      } catch {
        setState('error');
        errorEl.hidden = false;
        errorTextEl.textContent = 'network_error';
        errorRequestIdEl.textContent = '';
      }
    });

    copyDebugEl.addEventListener('click', async () => {
      if (!debugPayload) return;
      try {
        await navigator.clipboard.writeText(JSON.stringify(debugPayload));
      } catch {
        // no-op
      }
    });
  </script>
</body>
</html>`;
}

function isProtectedRoute(path: string) {
  return path === "/council" || path.startsWith("/decisions/") || path === "/ai/ping";
}

function routeForLogs(path: string) {
  if (path.startsWith("/decisions/")) return "/decisions/:id";
  return path;
}

function accessProtectionEnabled(env: Env) {
  return (env.ACCESS_PROTECTION_ENABLED ?? "true").toLowerCase() !== "false";
}

function hasRequiredAuthSecrets(env: Env) {
  return Boolean(env.DEVUSER_ACCESS_JWT && env.SERVICE_TOKEN_ID && env.SERVICE_TOKEN_SECRET);
}

function hasDevuserAccess(request: Request, env: Env) {
  const jwt = request.headers.get("cf-access-jwt-assertion")?.trim();
  if (!jwt) return false;
  if (!env.DEVUSER_ACCESS_JWT) return false;
  return jwt === env.DEVUSER_ACCESS_JWT;
}

function hasServiceTokenAccess(request: Request, env: Env) {
  const clientId = request.headers.get("cf-access-client-id")?.trim();
  const clientSecret = request.headers.get("cf-access-client-secret")?.trim();
  if (!clientId || !clientSecret) return false;
  if (!env.SERVICE_TOKEN_ID || !env.SERVICE_TOKEN_SECRET) return false;
  return clientId === env.SERVICE_TOKEN_ID && clientSecret === env.SERVICE_TOKEN_SECRET;
}

function computeLiveSpecialistsUsed(selectedSpecialists: SpecialistEntry[], env: Env): string[] {
  const liveEnabled = (env.USE_LIVE_SPECIALISTS ?? "false").toLowerCase() === "true";
  const mockEnabled = (env.USE_MOCK_SPECIALISTS ?? "false").toLowerCase() === "true";
  const maxLive = Number(env.MAX_LIVE_SPECIALISTS ?? "1");

  if (!liveEnabled || mockEnabled || maxLive <= 0) return [];

  return selectedSpecialists
    .filter((specialist) => LIVE_SPECIALIST_IDS.has(specialist.id))
    .slice(0, maxLive)
    .map((specialist) => specialist.id);
}

async function logRun(env: Env, requestId: string, route: string, ok: number, error: string | null) {
  try {
    await env.DB.prepare(
      "INSERT INTO runs (id, request_id, route, ok, error) VALUES (?, ?, ?, ?, ?)"
    )
      .bind(crypto.randomUUID(), requestId, route, ok, error)
      .run();
  } catch {
    // ignore logging errors to preserve request flow
  }
}

async function callOpenAIJson(env: Env, requestId: string) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("missing_openai_api_key");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL ?? "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Return ONLY JSON matching schema.",
                "Produce a tiny ping payload for LowNeon Consortium.",
                `Use this exact request id in request_id_echo: ${requestId}`,
                "request_id_echo must exactly equal the provided request id.",
              ].join(" "),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "PingPayload",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["message", "request_id_echo"],
            properties: {
              message: { type: "string" },
              request_id_echo: { type: "string" },
            },
          },
        },
      },
      metadata: { request_id: requestId },
      max_output_tokens: 200,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`openai_error_${res.status}:${raw.slice(0, 300)}`);
  }

  const json = JSON.parse(raw) as any;
  const outputText =
    json.output_text ??
    json.output?.map((o: any) => o?.content?.map((c: any) => c?.text).join("")).join("\n") ??
    "";

  let parsed: any = null;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    parsed = { message: "unparsed", request_id_echo: requestId, raw_output_text: outputText };
  }

  return { model: json.model ?? "unknown", parsed };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = crypto.randomUUID();
    const url = new URL(request.url);
    const normalizedPath = url.pathname !== "/" ? url.pathname.replace(/\/+$/, "") : "/";

    console.log("METHOD:", request.method);
    console.log("PATH:", normalizedPath);
    // Health check
    if (request.method === "GET" && normalizedPath === "/") {
      return ok({
        service: "consortium-kernel",
        room: "/room",
      }, requestId);
    }

    if (request.method === "GET" && normalizedPath === "/room") {
      return html(roomPage());
    }

    if (accessProtectionEnabled(env) && isProtectedRoute(normalizedPath)) {
      if (!hasRequiredAuthSecrets(env)) {
        await logRun(env, requestId, routeForLogs(normalizedPath), 0, "auth_misconfigured");
        return fail("auth_misconfigured", requestId, 403, "access protection enabled but auth secrets missing");
      }

      const authorized = hasDevuserAccess(request, env) || hasServiceTokenAccess(request, env);
      if (!authorized) {
        await logRun(env, requestId, routeForLogs(normalizedPath), 0, "unauthorized");
        return fail("unauthorized", requestId, 403);
      }
    }

    if (request.method === "GET" && normalizedPath === "/council") {
      return ok({ hint: "POST {goal} to /council" }, requestId);
    }

    if (request.method === "GET" && normalizedPath === "/ai/ping") {
      try {
        const result = await callOpenAIJson(env, requestId);
        await logRun(env, requestId, "/ai/ping", 1, null);
        return ok({ model: result.model, output: result.parsed }, requestId);
      } catch (e: any) {
        await logRun(env, requestId, "/ai/ping", 0, "openai_failed");
        return fail("openai_failed", requestId, 502, e?.message ?? String(e));
      }
    }

    // Council: create a decision (Slice 1)
    if (request.method === "POST" && normalizedPath === "/council") {
      let body: any;
      try {
        body = await request.json();
      } catch {
        return fail("invalid_json", requestId, 400);
      }

      const goal = (body?.goal ?? "").toString().trim();
      if (!goal) {
        return fail("missing_goal", requestId, 400);
      }

      const decisionId = crypto.randomUUID();
      const quorum = buildQuorum(goal);
      const decisionCard = buildDecisionCard(goal);
      const selectedSpecialists = selectSpecialists(goal);
      let tiered;
      try {
        tiered = await runTieredCouncil(requestId, goal, selectedSpecialists, quorum, decisionCard, {
          USE_MOCK_SPECIALISTS: env.USE_MOCK_SPECIALISTS,
          USE_LIVE_SPECIALISTS: env.USE_LIVE_SPECIALISTS,
          MAX_LIVE_SPECIALISTS: env.MAX_LIVE_SPECIALISTS,
          MAX_LIVE_SPECIALISTS_PROPOSE: env.MAX_LIVE_SPECIALISTS_PROPOSE,
          MAX_LIVE_SPECIALISTS_REVIEW: env.MAX_LIVE_SPECIALISTS_REVIEW,
          OPENAI_API_KEY: env.OPENAI_API_KEY,
          OPENAI_MODEL: env.OPENAI_MODEL,
          OPENAI_BASE_URL: env.OPENAI_BASE_URL,
        }, decisionId);
      } catch (e: any) {
        const detail = e?.message ?? String(e);
        if (detail.startsWith("governance_unsatisfied")) {
          await logRun(env, requestId, "/council", 0, "governance_unsatisfied");
          return fail("governance_unsatisfied", requestId, 500, detail);
        }
        const code = detail === "openai_timeout" ? "openai_timeout" : "openai_failed";
        await logRun(env, requestId, "/council", 0, code);
        return fail(code, requestId, 502, detail);
      }

      const reviewStage = tiered.stages.find((stage) => stage.stage === "review");
      const finalStage = tiered.stages.find((stage) => stage.stage === "final");
      const requiredChangeIds = reviewStage && "required_changes" in reviewStage
        ? reviewStage.required_changes.map((change) => change.id)
        : [];
      const satisfiedIds = finalStage && "satisfies_required_changes" in finalStage
        ? finalStage.satisfies_required_changes
        : [];
      const governanceSatisfied = requiredChangeIds.every((requiredId) => satisfiedIds.includes(requiredId));
      if (!governanceSatisfied) {
        await logRun(env, requestId, "/council", 0, "governance_unsatisfied");
        return fail("governance_unsatisfied", requestId, 500, "final stage must satisfy all required_changes ids");
      }

      const tasks = [
        ...decisionCard.plan.map((step) => ({
          id: crypto.randomUUID(),
          description: step,
          status: "todo" as const,
        })),
      ];

      const decisionArtifact = {
        ...tiered,
      };

      try {
        // decision
        await env.DB.prepare(
          "INSERT INTO decisions (id, goal, decision_json, status) VALUES (?, ?, ?, ?)"
        )
          .bind(decisionId, goal, JSON.stringify(decisionArtifact), "proposed")
          .run();

        // tasks
        for (const t of tasks) {
          await env.DB.prepare(
            "INSERT INTO tasks (id, decision_id, description, status) VALUES (?, ?, ?, ?)"
          )
            .bind(t.id, decisionId, t.description, t.status)
            .run();
        }

        // runs log
        await logRun(env, requestId, "/council", 1, null);

        const liveSpecialistsUsed = computeLiveSpecialistsUsed(selectedSpecialists, env);
        console.log(
          `LIVE_SPECIALISTS_USED=${JSON.stringify(liveSpecialistsUsed)} request_id=${requestId} decision_id=${decisionId}`
        );
      } catch (e: any) {
        await logRun(env, requestId, "/council", 0, e?.message ?? String(e));
        return fail("db_error", requestId, 500, e?.message ?? String(e));
      }

      return ok(
        {
          decision_id: decisionId,
          ...tiered,
          tasks,
        },
        requestId
      );
    }

    if (request.method === "GET" && normalizedPath.startsWith("/decisions/")) {
      const decisionId = normalizedPath.slice("/decisions/".length).trim();
      if (!decisionId) {
        return fail("invalid_id", requestId, 400);
      }

      try {
        const decisionRow = await env.DB.prepare(
          "SELECT id, decision_json FROM decisions WHERE id = ?"
        )
          .bind(decisionId)
          .first<{ id: string; decision_json: string }>();

        if (!decisionRow) {
          await logRun(env, requestId, "/decisions/:id", 0, "not_found");

          return fail("not_found", requestId, 404);
        }

        const tasksResult = await env.DB.prepare(
          "SELECT id, description, status FROM tasks WHERE decision_id = ? ORDER BY created_at ASC"
        )
          .bind(decisionId)
          .all<{ id: string; description: string; status: string }>();

        const decisionArtifact = JSON.parse(decisionRow.decision_json) as {
          interaction_model?: "tiered";
          stages?: unknown[];
          selected_specialists?: SpecialistEntry[];
          specialist_stances?: SpecialistStance[];
          quorum?: QuorumSeatStance[];
          decision_card?: DecisionCard;
          goal?: string;
          constraints?: string[];
          acceptance_tests?: string[];
        };

        const quorum = Array.isArray(decisionArtifact.quorum) ? decisionArtifact.quorum : [];
        const selectedSpecialists = Array.isArray(decisionArtifact.selected_specialists)
          ? decisionArtifact.selected_specialists
          : [];
        const specialistStances = Array.isArray(decisionArtifact.specialist_stances)
          ? decisionArtifact.specialist_stances.filter((stance) => validateSpecialistStance(stance))
          : [];
        const interactionModel = decisionArtifact.interaction_model === "tiered"
          ? "tiered"
          : "tiered";
        const stages = Array.isArray(decisionArtifact.stages) ? decisionArtifact.stages : [];
        const decisionCard = decisionArtifact.decision_card ?? {
          goal: decisionArtifact.goal ?? "",
          constraints: decisionArtifact.constraints ?? [],
          plan: [],
          acceptance_tests: decisionArtifact.acceptance_tests ?? [],
          definition_of_done: [],
        };
        const tasks = tasksResult.results ?? [];

        await logRun(env, requestId, "/decisions/:id", 1, null);

        return ok(
          {
            decision_id: decisionId,
            interaction_model: interactionModel,
            stages,
            selected_specialists: selectedSpecialists,
            specialist_stances: specialistStances,
            quorum,
            decision_card: decisionCard,
            tasks,
          },
          requestId
        );
      } catch (e: any) {
        await logRun(env, requestId, "/decisions/:id", 0, e?.message ?? String(e));
        return fail("db_error", requestId, 500, e?.message ?? String(e));
      }
    }

    return fail("not_found", requestId, 404);
  },
};
