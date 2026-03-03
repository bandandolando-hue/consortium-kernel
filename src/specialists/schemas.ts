export type SpecialistStance = {
  role: string;
  stance: string;
  risks: string[];
  asks: string[];
  proposed_changes: string[];
};

export function validateSpecialistStance(input: unknown): input is SpecialistStance {
  if (!input || typeof input !== "object") return false;

  const candidate = input as Partial<SpecialistStance>;

  if (typeof candidate.role !== "string" || !candidate.role.trim()) return false;
  if (typeof candidate.stance !== "string" || !candidate.stance.trim()) return false;
  if (!Array.isArray(candidate.risks)) return false;
  if (!candidate.risks.every((risk) => typeof risk === "string" && risk.trim().length > 0)) return false;
  if (!Array.isArray(candidate.asks)) return false;
  if (!candidate.asks.every((ask) => typeof ask === "string" && ask.trim().length > 0)) return false;
  if (!Array.isArray(candidate.proposed_changes)) return false;
  if (!candidate.proposed_changes.every((change) => typeof change === "string" && change.trim().length > 0)) return false;

  return true;
}
