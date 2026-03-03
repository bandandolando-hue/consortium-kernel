import type { SpecialistEntry } from "./select";

type DecisionCard = {
  goal: string;
  constraints: string[];
  plan: string[];
  acceptance_tests: string[];
  definition_of_done: string[];
};

type Stage = "propose" | "review";

function compactList(label: string, items: string[], max = 8) {
  const safe = (items ?? []).slice(0, max);
  return [`${label}:`, ...safe.map((x) => `- ${x}`)].join("\n");
}

export function makeCaptainFrame(args: {
  specialist: SpecialistEntry;
  stage: Stage;
  decisionCard: DecisionCard;
  proposeStancesDigest?: Array<{ role: string; stance: string; risks: string[] }>;
}): string {
  const { specialist, stage, decisionCard, proposeStancesDigest } = args;

  const header = [
    `Specialist: ${specialist.name} (${specialist.id})`,
    `Best for: ${specialist.best_for}`,
    `Output: ${specialist.output_type}`,
    `Tier: ${specialist.tier}`,
    `Stage: ${stage}`,
  ].join("\n");

  const spine = [
    "DECISION_CARD (canonical spine — do not rewrite):",
    `Goal: ${decisionCard.goal}`,
    compactList("Constraints", decisionCard.constraints, 12),
    compactList("Plan", decisionCard.plan, 12),
    compactList("Acceptance tests", decisionCard.acceptance_tests, 12),
    compactList("Definition of done", decisionCard.definition_of_done, 12),
  ].join("\n");

  let reviewContext = "";
  if (stage === "review") {
    reviewContext += "\nStage: review";
    reviewContext += "\n\nDECISION CARD SUMMARY:";
    reviewContext += `\nGoal: ${decisionCard.goal}`;
    reviewContext += `\nConstraints: ${decisionCard.constraints.join(", ")}`;
    if (proposeStancesDigest?.length) {
      reviewContext += "\n\nPROPOSE DIGEST (for review only):";
      reviewContext += proposeStancesDigest.slice(0, 10).map((s) => {
        const risks = (s.risks ?? []).slice(0, 3).map((r) => `  - ${r}`).join("\n");
        return `- ${s.role}: ${s.stance}\n${risks}`;
      }).join("\n");
    }
    reviewContext += "\n\nINSTRUCTION: You are reviewing the propose stances and must produce required changes if any. If you see governance gaps, express them as asks/proposed_changes clearly.";
  }

  const instructions = [
    "",
    "TASK:",
    stage === "propose"
      ? "Produce a propose-stage stance: concrete suggestions within your specialty. Do NOT invent canon. Do NOT rewrite the plan; propose targeted changes."
      : "Produce a review-stage governance stance: identify compliance risks and REQUIRED changes needed to satisfy constraints and preserve canon/tone. Be strict.",
    "",
    "OUTPUT RULES (non-negotiable):",
    "- Return ONLY valid JSON.",
    "- JSON MUST match this shape exactly:",
    `{"role":"${specialist.id}","stance":"...","risks":["..."],"asks":["..."],"proposed_changes":["..."]}`,
    "- Each array must have at least 1 item. Keep each array to 1–5 items.",
    "- Keep stance compact (3–8 sentences).",
  ].join("\n");

  return `${header}\n\n${spine}${reviewContext}\n${instructions}\n`;
}
