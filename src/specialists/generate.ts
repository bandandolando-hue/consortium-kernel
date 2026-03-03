import { makeCaptainFrame } from "./frame";
import { generateMockSpecialistStance } from "./mock";
import type { SpecialistEntry } from "./select";
import { type SpecialistStance, validateSpecialistStance } from "./schemas";

type EnvLike = {
  OPENAI_API_KEY?: string;
  USE_MOCK_SPECIALISTS?: string;
  USE_LIVE_SPECIALISTS?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
};

type DecisionCard = {
  goal: string;
  constraints: string[];
  plan: string[];
  acceptance_tests: string[];
  definition_of_done: string[];
};

type ProposeStanceDigest = Array<{ role: string; stance: string; risks: string[] }>;
type OpenAIAttemptResult = { ok: boolean; status: number; raw: string };

const OPENAI_TIMEOUT_MS = 12_000;

let warnedMissingModel = false;
// Format strategy cache: "auto" (default), "text.format" (force fallback)
let FORMAT_MODE: "auto" | "text.format" = "auto";

function liveEnabled(env: EnvLike): boolean {
  return (env.USE_LIVE_SPECIALISTS ?? "false").toLowerCase() === "true";
}

function mockEnabled(env: EnvLike): boolean {
  return (env.USE_MOCK_SPECIALISTS ?? "false").toLowerCase() === "true";
}

function clampArray(xs: unknown, fallback: string): string[] {
  const arr = Array.isArray(xs) ? xs.map((x) => String(x).trim()).filter(Boolean) : [];
  return arr.length ? arr.slice(0, 5) : [fallback];
}

function normalizeStance(candidate: unknown, role: string): SpecialistStance {
  const source = (candidate ?? {}) as Record<string, unknown>;
  const normalized: SpecialistStance = {
    role,
    stance: String(source.stance ?? "No stance provided.").trim() || "No stance provided.",
    risks: clampArray(source.risks, "no_risks_listed"),
    asks: clampArray(source.asks, "no_asks_listed"),
    proposed_changes: clampArray(source.proposed_changes, "no_changes_listed"),
  };

  if (!validateSpecialistStance(normalized)) {
    throw new Error("invalid_specialist_stance");
  }

  return normalized;
}

function extractOutputText(payload: Record<string, unknown>): string {
  const outputText = payload.output_text;
  if (typeof outputText === "string" && outputText.trim().length > 0) {
    return outputText;
  }

  const output = payload.output;
  if (!Array.isArray(output)) return "";

  const chunks: string[] = [];
  for (const item of output) {
    const itemRecord = item as Record<string, unknown>;
    const content = itemRecord.content;
    if (!Array.isArray(content)) continue;

    for (const chunk of content) {
      const chunkRecord = chunk as Record<string, unknown>;
      const text = chunkRecord.text;
      if (typeof text === "string" && text.trim().length > 0) {
        chunks.push(text);
      }
    }
  }

  return chunks.join("\n");
}

function parseStanceOrFail(raw: string, role: string): SpecialistStance {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("openai_invalid_json_payload");
  }

  const outputText = extractOutputText(payload);
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error(`openai_unparseable_output:${String(outputText).slice(0, 200)}`);
  }

  return normalizeStance(parsed, role);
}

function resolveModel(env: EnvLike): string {
  const explicit = env.OPENAI_MODEL?.trim();
  if (explicit) return explicit;

  if (!warnedMissingModel) {
    console.warn("WARN OPENAI_MODEL missing; defaulting gpt-4o-mini");
    warnedMissingModel = true;
  }

  return "gpt-4o-mini";
}

async function sendResponsesRequest(args: {
  apiKey: string;
  baseUrl: string;
  body: Record<string, unknown>;
}): Promise<OpenAIAttemptResult> {
  const { apiKey, baseUrl, body } = args;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    return {
      ok: res.ok,
      status: res.status,
      raw: await res.text(),
    };
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("openai_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function tryJsonSchemaFormat(args: {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  requestId: string;
  specialistId: string;
  stage: "propose" | "review";
  sharedSchema: Record<string, unknown>;
}): Promise<OpenAIAttemptResult> {
  const { apiKey, baseUrl, model, prompt, requestId, specialistId, stage, sharedSchema } = args;
  return sendResponsesRequest({
    apiKey,
    baseUrl,
    body: {
      model,
      input: prompt,
      response_format: {
        type: "json_schema",
        json_schema: sharedSchema,
      },
      metadata: { request_id: requestId, specialist_id: specialistId, stage },
      max_output_tokens: 450,
    },
  });
}

async function tryTextFormatJsonSchema(args: {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
  requestId: string;
  specialistId: string;
  stage: "propose" | "review";
  sharedSchema: Record<string, unknown>;
}): Promise<OpenAIAttemptResult> {
  const { apiKey, baseUrl, model, prompt, requestId, specialistId, stage, sharedSchema } = args;
  return sendResponsesRequest({
    apiKey,
    baseUrl,
    body: {
      model,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: prompt }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          ...sharedSchema,
        },
      },
      metadata: { request_id: requestId, specialist_id: specialistId, stage },
      max_output_tokens: 450,
    },
  });
}


async function callOpenAIStance(args: {
  env: EnvLike;
  requestId: string;
  specialist: SpecialistEntry;
  stage: "propose" | "review";
  decisionCard: DecisionCard;
  proposeStancesDigest?: ProposeStanceDigest;
}): Promise<SpecialistStance> {
  const { env, requestId, specialist, stage, decisionCard, proposeStancesDigest } = args;
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("missing_openai_api_key");

  const model = resolveModel(env);
  const baseUrl = (env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const prompt = makeCaptainFrame({
    specialist,
    stage,
    decisionCard,
    proposeStancesDigest,
  });

  const sharedSchema = {
    name: "SpecialistStance",
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["role", "stance", "risks", "asks", "proposed_changes"],
      properties: {
        role: { type: "string" },
        stance: { type: "string", minLength: 3 },
        risks: { type: "array", minItems: 1, items: { type: "string", minLength: 2 } },
        asks: { type: "array", minItems: 1, items: { type: "string", minLength: 2 } },
        proposed_changes: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 2 },
        },
      },
    },
  };

  let attempt: OpenAIAttemptResult;

  // Use cached format strategy if set
  if (FORMAT_MODE === "text.format") {
    attempt = await tryTextFormatJsonSchema({
      apiKey,
      baseUrl,
      model,
      prompt,
      requestId,
      specialistId: specialist.id,
      stage,
      sharedSchema,
    });
  } else {
    attempt = await tryJsonSchemaFormat({
      apiKey,
      baseUrl,
      model,
      prompt,
      requestId,
      specialistId: specialist.id,
      stage,
      sharedSchema,
    });

    // On migration error, cache strategy and retry immediately
    if (!attempt.ok && attempt.status === 400 && attempt.raw.includes("moved to 'text.format'")) {
      FORMAT_MODE = "text.format";
      console.warn("FORMAT_MODE set to text.format after migration error");
      attempt = await tryTextFormatJsonSchema({
        apiKey,
        baseUrl,
        model,
        prompt,
        requestId,
        specialistId: specialist.id,
        stage,
        sharedSchema,
      });
    }
  }

  if (!attempt.ok) {
    throw new Error(`openai_${attempt.status}:${attempt.raw.slice(0, 300)}`);
  }

  return parseStanceOrFail(attempt.raw, specialist.id);
}

export async function generateSpecialistStance(args: {
  env: EnvLike;
  requestId: string;
  specialist: SpecialistEntry;
  stage: "propose" | "review";
  decisionCard: DecisionCard;
  proposeStancesDigest?: ProposeStanceDigest;
}): Promise<SpecialistStance> {
  const { env, specialist, stage, decisionCard, proposeStancesDigest } = args;

  // Accept a decision_id if present in args for logging
  // (decisionCard may not have id, so pass as arg if needed)
  const decisionId = (args as any).decisionId || (decisionCard as any).id || "unknown";

  const shouldGoLive = !mockEnabled(env) && liveEnabled(env);

  if (!shouldGoLive) {
    const framedJob = makeCaptainFrame({
      specialist,
      stage,
      decisionCard,
      proposeStancesDigest,
    });
    return generateMockSpecialistStance(specialist, framedJob);
  }

  // Observability: log stage, specialist, and live usage
  console.log("STANCE_GEN", specialist.id, stage, "openai");
  // Optionally log all live usage for both propose and review
  // (Caller should aggregate if needed, but log here for acceptance proof)
  console.log(`LIVE_USED specialist=${specialist.id} stage=${stage} request_id=${args.requestId} decision_id=${decisionId}`);
  const stance = await callOpenAIStance(args);
  return stance;
}
