import { type SpecialistStance, validateSpecialistStance } from "./schemas";
import type { SpecialistEntry } from "./select";
import { generateSpecialistStance } from "./generate";

export type SpecialistInferenceEnv = {
  USE_MOCK_SPECIALISTS?: string;
  USE_LIVE_SPECIALISTS?: string;
  MAX_LIVE_SPECIALISTS?: string;
  MAX_LIVE_SPECIALISTS_PROPOSE?: string;
  MAX_LIVE_SPECIALISTS_REVIEW?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_BASE_URL?: string;
};

export type DecisionCard = {
  goal: string;
  constraints: string[];
  plan: string[];
  acceptance_tests: string[];
  definition_of_done: string[];
};

export type RequiredChange = {
  id: string;
  from_role: string;
  type: "artifact" | "tone" | "security" | "data" | "api" | "ui" | "other";
  statement: string;
  evidence_kind: "plan_contains" | "constraint_contains" | "acceptance_test_contains" | "definition_of_done_contains" | "other";
  evidence_match: string;
};

const RC_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "be",
  "by",
  "for",
  "from",
  "if",
  "in",
  "into",
  "is",
  "it",
  "must",
  "of",
  "on",
  "or",
  "should",
  "that",
  "the",
  "to",
  "with",
]);

function canonicalizeForMatch(input: string): string {
  return input
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function inferRcType(fromRole: string): RequiredChange["type"] {
  if (fromRole === "NARRATIVE") return "tone";
  if (fromRole.includes("SEC") || fromRole.includes("GATE")) return "security";
  if (fromRole.includes("DATA") || fromRole.includes("ARCHIVIST")) return "data";
  if (fromRole.includes("API") || fromRole.includes("ARCHITECT")) return "api";
  if (fromRole.includes("UX") || fromRole.includes("SPECTRA") || fromRole.includes("UI")) return "ui";
  return "artifact";
}

function inferEvidenceKind(statement: string): RequiredChange["evidence_kind"] {
  const s = canonicalizeForMatch(statement);
  if (s.includes("acceptance test") || s.includes("acceptance criteria")) return "acceptance_test_contains";
  if (s.includes("definition of done") || s.includes("dod")) return "definition_of_done_contains";
  if (s.includes("constraint") || s.includes("guardrail")) return "constraint_contains";
  if (s.includes("plan") || s.includes("step")) return "plan_contains";
  return "other";
}

function extractQuotedToken(statement: string): string | null {
  const quoteMatch = statement.match(/["'`](.{3,60}?)["'`]/);
  if (!quoteMatch) return null;
  const value = canonicalizeForMatch(quoteMatch[1] ?? "");
  return value || null;
}

function deriveEvidenceMatch(statement: string): string {
  const quoted = extractQuotedToken(statement);
  if (quoted) return quoted.replace(/\s+/g, "_");

  const includeMatch = statement.match(/(?:include|includes|contains?|mention|mentions|add|ensure)\s+([A-Za-z0-9 _-]{3,80})/i);
  if (includeMatch) {
    const candidate = canonicalizeForMatch(includeMatch[1] ?? "").split(" ").slice(0, 4).join("_");
    if (candidate.length >= 3) return candidate;
  }

  const tokens = canonicalizeForMatch(statement)
    .split(" ")
    .filter((token) => token.length >= 3 && !RC_STOP_WORDS.has(token));
  const fallback = tokens.slice(0, 3).join("_");
  return fallback || "review_update";
}

function deterministicRcHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  return String(unsigned).padStart(6, "0");
}

type RequiredChangeSeed = {
  from_role: string;
  type?: RequiredChange["type"];
  statement: string;
  evidence_kind?: RequiredChange["evidence_kind"];
  evidence_match?: string;
  id?: string;
};

export function normalizeRequiredChange(seed: RequiredChangeSeed): RequiredChange {
  const fromRole = seed.from_role.trim().toUpperCase();
  const statement = seed.statement.trim();
  const evidenceKind = seed.evidence_kind ?? inferEvidenceKind(statement);
  const evidenceMatch = seed.evidence_match ?? deriveEvidenceMatch(statement);
  const type = seed.type ?? inferRcType(fromRole);
  const stableKey = [fromRole, type, evidenceKind, evidenceMatch].join("|");
  const id = seed.id ?? `RC-${deterministicRcHash(stableKey)}`;

  return {
    id,
    from_role: fromRole,
    type,
    statement,
    evidence_kind: evidenceKind,
    evidence_match: evidenceMatch,
  };
}

function containsEvidence(section: string, evidenceMatch: string): boolean {
  const haystack = canonicalizeForMatch(section);
  const needle = canonicalizeForMatch(evidenceMatch);
  if (!needle) return false;
  return haystack.includes(needle);
}

export function evaluateSatisfaction(requiredChanges: RequiredChange[], decisionCard: DecisionCard) {
  const corpus = {
    plan: decisionCard.plan.join("\n"),
    constraints: decisionCard.constraints.join("\n"),
    acceptance_tests: decisionCard.acceptance_tests.join("\n"),
    definition_of_done: decisionCard.definition_of_done.join("\n"),
  };

  const satisfiedIds: string[] = [];
  const missingIds: string[] = [];

  for (const rc of requiredChanges) {
    let found = false;
    switch (rc.evidence_kind) {
      case "plan_contains":
        found = containsEvidence(corpus.plan, rc.evidence_match);
        break;
      case "constraint_contains":
        found = containsEvidence(corpus.constraints, rc.evidence_match);
        break;
      case "acceptance_test_contains":
        found = containsEvidence(corpus.acceptance_tests, rc.evidence_match);
        break;
      case "definition_of_done_contains":
        found = containsEvidence(corpus.definition_of_done, rc.evidence_match);
        break;
      default:
        found = Object.values(corpus).some((section) => containsEvidence(section, rc.evidence_match));
        break;
    }

    if (found) satisfiedIds.push(rc.id);
    else missingIds.push(rc.id);
  }

  return { satisfiedIds, missingIds };
}

type ProposeStage = {
  stage: "propose";
  specialists: string[];
  stances: SpecialistStance[];
};

type ReviewStage = {
  stage: "review";
  specialists: string[];
  stances: SpecialistStance[];
  required_changes: Array<Pick<RequiredChange, "id" | "from_role" | "type" | "statement">>;
};

type FinalStage = {
  stage: "final";
  specialists: ["CAPTAIN"];
  satisfies_required_changes: string[];
  decision_card: DecisionCard;
};

export type TieredArtifact = {
  interaction_model: "tiered";
  selected_specialists: SpecialistEntry[];
  specialist_stances: SpecialistStance[];
  quorum: unknown[];
  decision_card: DecisionCard;
  stages: [ProposeStage, ReviewStage, FinalStage];
};


const LIVE_PROPOSE_IDS = new Set(["CATALYST", "SPECTRA"]);
const LIVE_REVIEW_IDS = new Set(["ARCHITECT"]);

function maxLiveForStage(env: SpecialistInferenceEnv, stage: "propose" | "review") {
  const key = stage === "propose" ? "MAX_LIVE_SPECIALISTS_PROPOSE" : "MAX_LIVE_SPECIALISTS_REVIEW";
  const raw = (env as any)[key] ?? "1";
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 1;
}

function isLiveEligible(specialistId: string, stage: "propose" | "review") {
  return stage === "propose"
    ? LIVE_PROPOSE_IDS.has(specialistId)
    : LIVE_REVIEW_IDS.has(specialistId);
}

function toRoleLabel(specialist: SpecialistEntry): string {
  return specialist.id;
}

function classifyGovernors(selected: SpecialistEntry[]): SpecialistEntry[] {
  return selected.filter((specialist) => specialist.tier === "review");
}

function classifyProposers(selected: SpecialistEntry[]): SpecialistEntry[] {
  return selected.filter((specialist) => specialist.tier === "propose");
}

function buildRequiredChanges(reviewStances: SpecialistStance[]): RequiredChange[] {
  const requiredById = new Map<string, RequiredChange>();
  for (const stance of reviewStances) {
    const promoted = Array.isArray(stance.proposed_changes) ? stance.proposed_changes : [];
    for (const statement of promoted) {
      const normalized = normalizeRequiredChange({
        from_role: stance.role,
        statement,
        type: inferRcType(stance.role),
      });
      requiredById.set(normalized.id, normalized);
    }
  }
  return [...requiredById.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function buildValidatedStances(
  specialists: SpecialistEntry[],
  requestId: string,
  stage: "propose" | "review",
  decisionCard: DecisionCard,
  env?: SpecialistInferenceEnv,
  proposeStancesDigest?: Array<{ role: string; stance: string; risks: string[] }>
): Promise<{ stances: SpecialistStance[]; liveUsed: string[] }> {

  // Per-stage live counters
  let liveUsedPropose = 0;
  let liveUsedReview = 0;
  const liveUsed: string[] = [];
  const stances = await Promise.all(
    specialists.map((specialist) => {
      let forceMock = false;
      let stageMax = maxLiveForStage(env ?? {}, stage);
      let used = stage === "propose" ? liveUsedPropose : liveUsedReview;

      const shouldGoLive =
        env?.USE_LIVE_SPECIALISTS?.toLowerCase() === "true" &&
        env?.USE_MOCK_SPECIALISTS?.toLowerCase() !== "true" &&
        isLiveEligible(specialist.id, stage) &&
        used < stageMax;

      if (shouldGoLive) {
        liveUsed.push(specialist.id);
        if (stage === "propose") liveUsedPropose++;
        else liveUsedReview++;
      } else {
        forceMock = true;
      }

      return generateSpecialistStance({
        env: {
          ...env,
          USE_MOCK_SPECIALISTS: forceMock ? "true" : env?.USE_MOCK_SPECIALISTS,
        },
        requestId,
        specialist,
        stage,
        decisionCard,
        proposeStancesDigest,
      });
    })
  );

  if (!stances.every((stance) => validateSpecialistStance(stance))) {
    throw new Error("invalid_specialist_stances");
  }
  return { stances, liveUsed };
}

export async function runTieredCouncil(
  requestId: string,
  goal: string,
  selected: SpecialistEntry[],
  quorum: unknown[],
  decisionCard: DecisionCard,
  env?: SpecialistInferenceEnv,
  decisionId?: string
): Promise<TieredArtifact> {
  const proposers = classifyProposers(selected);
  const governors = classifyGovernors(selected);

  const { stances: proposeStances, liveUsed: proposeLiveUsed } = await buildValidatedStances(
    proposers,
    requestId,
    "propose",
    decisionCard,
    env
  );
  const proposeDigest = proposeStances.map((stance) => ({
    role: stance.role,
    stance: stance.stance,
    risks: stance.risks,
  }));
  const { stances: reviewStances, liveUsed: reviewLiveUsed } = await buildValidatedStances(
    governors,
    requestId,
    "review",
    decisionCard,
    env,
    proposeDigest
  );

  console.log(
    `LIVE_USED propose=${JSON.stringify(proposeLiveUsed)} review=${JSON.stringify(reviewLiveUsed)} request_id=${requestId} decision_id=${decisionId ?? "unknown"}`
  );

  const requiredChanges = buildRequiredChanges(reviewStances);

  // Deterministic satisfaction evaluation
  const { satisfiedIds, missingIds } = evaluateSatisfaction(requiredChanges, decisionCard);
  console.log(
    `GOVERNANCE_EVAL required=${requiredChanges.length} satisfied=${satisfiedIds.length} missing=${JSON.stringify(missingIds)} request_id=${requestId} decision_id=${decisionId ?? "unknown"}`
  );

  const proposeStage: ProposeStage = {
    stage: "propose",
    specialists: proposers.map((specialist) => toRoleLabel(specialist)),
    stances: proposeStances,
  };

  const reviewStage: ReviewStage = {
    stage: "review",
    specialists: governors.map((specialist) => toRoleLabel(specialist)),
    stances: reviewStances,
    required_changes: requiredChanges.map(({ id, from_role, type, statement }) => ({
      id,
      from_role,
      type,
      statement,
    })),
  };

  const finalStage: FinalStage = {
    stage: "final",
    specialists: ["CAPTAIN"],
    satisfies_required_changes: satisfiedIds,
    decision_card: decisionCard,
  };

  // Hard fail if any missing
  if (missingIds.length) {
    throw new Error(`governance_unsatisfied: missing RCs: ${missingIds.join(", ")}`);
  }

  return {
    interaction_model: "tiered",
    selected_specialists: selected,
    specialist_stances: [...proposeStances, ...reviewStances],
    quorum,
    decision_card: decisionCard,
    stages: [proposeStage, reviewStage, finalStage],
  };
}
