import type { SpecialistEntry } from "../specialists/select";
import { type SpecialistStance, validateSpecialistStance } from "../specialists/schemas";

type OpenAIAdapterConfig = {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

type ResponsesApiOutputContent = {
  type?: string;
  text?: string;
};

type ResponsesApiOutput = {
  content?: ResponsesApiOutputContent[];
};

type ResponsesApiResponse = {
  output_text?: string;
  output?: ResponsesApiOutput[];
};

function stripFences(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function parseJsonObject(value: string): Record<string, unknown> {
  const cleaned = stripFences(value);
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const first = cleaned.indexOf("{");
    const last = cleaned.lastIndexOf("}");
    if (first === -1 || last === -1 || last <= first) {
      throw new Error("openai_invalid_json_response");
    }
    const candidate = cleaned.slice(first, last + 1);
    return JSON.parse(candidate) as Record<string, unknown>;
  }
}

function toStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function normalizeStanceShape(raw: Record<string, unknown>, role: string): SpecialistStance {
  return {
    role,
    stance: typeof raw.stance === "string" ? raw.stance.trim() : "",
    risks: toStringArray(raw.risks),
    asks: toStringArray(raw.asks),
    proposed_changes: toStringArray(raw.proposed_changes),
  };
}

function stanceJsonSchemaFor(role: string) {
  return {
    name: "specialist_stance_v1",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["role", "stance", "risks", "asks", "proposed_changes"],
      properties: {
        role: { type: "string", const: role },
        stance: { type: "string", minLength: 3 },
        risks: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 2 },
        },
        asks: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 2 },
        },
        proposed_changes: {
          type: "array",
          minItems: 1,
          items: { type: "string", minLength: 2 },
        },
      },
    },
  };
}

function extractResponseText(payload: ResponsesApiResponse): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim().length > 0) {
    return payload.output_text;
  }

  const textFromOutput = payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((content) => content.type === "output_text" && typeof content.text === "string")
    ?.text;

  if (typeof textFromOutput === "string" && textFromOutput.trim().length > 0) {
    return textFromOutput;
  }

  throw new Error("openai_empty_response");
}

export async function inferSpecialistStanceWithOpenAI(
  specialist: SpecialistEntry,
  framedJob: string,
  config: OpenAIAdapterConfig
): Promise<SpecialistStance> {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) {
    throw new Error("openai_api_key_missing");
  }

  const fetchImpl = config.fetchImpl ?? fetch;
  const model = config.model ?? "gpt-4.1-mini";
  const baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");

  const system = [
    "You are a specialist advisor.",
    "Follow the provided frame exactly.",
    "Return exactly one JSON object and no markdown.",
  ].join("\n");

  const response = await fetchImpl(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: system }] },
        { role: "user", content: [{ type: "input_text", text: framedJob }] },
      ],
      text: {
        format: {
          type: "json_schema",
          ...stanceJsonSchemaFor(specialist.id),
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`openai_request_failed:${response.status}:${detail}`);
  }

  const payload = (await response.json()) as ResponsesApiResponse;
  const content = extractResponseText(payload);

  const parsed = parseJsonObject(content);
  const stance = normalizeStanceShape(parsed, specialist.id);

  if (!validateSpecialistStance(stance)) {
    throw new Error("openai_invalid_stance_shape");
  }

  return stance;
}
