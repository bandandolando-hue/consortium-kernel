import type { SpecialistEntry } from "./select";
import { type SpecialistStance, validateSpecialistStance } from "./schemas";

function hashText(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function chooseStance(seed: number): string {
  const stances = [
    "Advance with a constrained, testable implementation path.",
    "Proceed with caution around coupling and hidden complexity.",
    "Prefer a smaller scope cut before expanding delivery surface.",
  ];
  return stances[seed % stances.length];
}

export function generateMockSpecialistStance(specialist: SpecialistEntry, framedJob: string): SpecialistStance {
  const seed = hashText(`${specialist.id}:${framedJob}`);

  const stance: SpecialistStance = {
    role: specialist.id,
    stance: chooseStance(seed),
    risks: [
      `${specialist.name} misalignment risk if ${specialist.best_for.toLowerCase()} priorities are skipped.`,
    ],
    asks: [
      `Keep ${specialist.name} outputs explicit in the staged artifact.`,
    ],
    proposed_changes: [
      `Apply ${specialist.name} guidance to the active decision card before execution.`,
    ],
  };

  if (specialist.id === "ARCHIVIST") {
    stance.proposed_changes = ["synthesize five council stances into one coherent direction"];
  }

  if (specialist.id === "NARRATIVE") {
    stance.proposed_changes = ["persist plan-derived tasks to tasks table and verify mirrored readback"];
  }

  if (!validateSpecialistStance(stance)) {
    throw new Error(`invalid_specialist_stance:${specialist.id}`);
  }

  return stance;
}
