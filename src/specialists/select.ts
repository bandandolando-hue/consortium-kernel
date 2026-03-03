import registry from "../../schemas/specialists/specialists.v1.json";

export type SpecialistEntry = {
  id: string;
  name: string;
  best_for: string;
  output_type: string;
  selection_rule: {
    kind: "always" | "keyword";
    allow_disable?: boolean;
    keywords?: string[];
  };
  tier: "propose" | "review";
  stance_schema: string;
};

const ALWAYS_INCLUDE_IDS = ["ARCHIVIST"];
const KEYWORD_MATCH_MODE = "word-boundary" as const;
const MAX_KEYWORDS_PER_SPECIALIST = 50;
let cachedRegistry: SpecialistEntry[] | null = null;

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesKeyword(goalText: string, keyword: string): boolean {
  const normalizedGoal = normalizeText(goalText);
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedGoal || !normalizedKeyword) return false;

  if (KEYWORD_MATCH_MODE === "word-boundary") {
    return (` ${normalizedGoal} `).includes(` ${normalizedKeyword} `);
  }

  return normalizedGoal.includes(normalizedKeyword);
}

export function validateSpecialistsRegistryInvariants(entries: SpecialistEntry[]): void {
  const seenIds = new Set<string>();

  for (const entry of entries) {
    if (seenIds.has(entry.id)) {
      throw new Error(`invalid_specialists_registry_duplicate_id:${entry.id}`);
    }
    seenIds.add(entry.id);

    if (entry.selection_rule.kind === "keyword") {
      const keywords = entry.selection_rule.keywords ?? [];

      if (keywords.length > MAX_KEYWORDS_PER_SPECIALIST) {
        throw new Error(`invalid_specialists_registry_keyword_limit:${entry.id}`);
      }

      const hasInvalidKeyword = keywords.some((keyword) => normalizeText(keyword).length === 0);
      if (hasInvalidKeyword) {
        throw new Error(`invalid_specialists_registry_empty_keyword:${entry.id}`);
      }
    }
  }
}

export function getSpecialistsRegistry(): SpecialistEntry[] {
  if (cachedRegistry) return cachedRegistry;

  const entries = (registry.specialists ?? []) as SpecialistEntry[];
  validateSpecialistsRegistryInvariants(entries);
  cachedRegistry = entries;

  return cachedRegistry;
}

export function selectSpecialists(job: string): SpecialistEntry[] {
  const normalized = normalizeText(job);
  const all = getSpecialistsRegistry();
  const byId = new Map(all.map((specialist) => [specialist.id, specialist]));

  const selected: SpecialistEntry[] = [];

  for (const id of ALWAYS_INCLUDE_IDS) {
    const specialist = byId.get(id);
    if (specialist) selected.push(specialist);
  }

  for (const specialist of all) {
    if (selected.some((entry) => entry.id === specialist.id)) continue;

    if (specialist.selection_rule.kind === "always") {
      selected.push(specialist);
      continue;
    }

    if (specialist.selection_rule.kind === "keyword") {
      const keywords = specialist.selection_rule.keywords ?? [];
      const triggered = keywords.some((keyword) => matchesKeyword(normalized, keyword));
      if (triggered) {
        selected.push(specialist);
      }
    }
  }

  const hasProposer = selected.some((specialist) => specialist.tier === "propose");
  if (!hasProposer) {
    const catalyst = byId.get("CATALYST");
    if (catalyst && !selected.some((specialist) => specialist.id === catalyst.id)) {
      selected.push(catalyst);
    }
  }

  return selected;
}
