/**
 * Dynamic stage ("phase") catalogue.
 *
 * Super admins create churches with an English abbreviation code, and every church
 * receives this default set of stages. Each stage carries its own English
 * abbreviation code (used to build usernames such as `mar_girgis_prep1_59201`) and
 * belongs to a sector ("قطاع") used for PHASE_ADMIN scoping.
 */

export type SectorKey =
  | "KG"
  | "PRIMARY"
  | "PREPARATORY"
  | "SECONDARY"
  | "UNIVERSITY"
  | "GRADUATES";

export type SectorDefinition = {
  key: SectorKey;
  name: string;
  abbreviation: string;
};

export const SECTORS: readonly SectorDefinition[] = [
  { key: "KG", name: "حضانة (KG)", abbreviation: "kg" },
  { key: "PRIMARY", name: "ابتدائي", abbreviation: "prim" },
  { key: "PREPARATORY", name: "إعدادي", abbreviation: "prep" },
  { key: "SECONDARY", name: "ثانوي", abbreviation: "sec" },
  { key: "UNIVERSITY", name: "جامعي", abbreviation: "univ" },
  { key: "GRADUATES", name: "خريجين", abbreviation: "grad" },
] as const;

export type PhaseDefinition = {
  /** Arabic display label, e.g. "1 إعدادي" */
  name: string;
  /** English abbreviation code, e.g. "prep1" */
  abbreviation: string;
  sector: SectorKey;
  /** Sequential order used by reports and lists (KG1 → Graduates). */
  sortOrder: number;
};

/** Canonical order required by the church-wide Excel report. */
export const DEFAULT_PHASES: readonly PhaseDefinition[] = [
  { name: "KG1", abbreviation: "kg1", sector: "KG", sortOrder: 1 },
  { name: "KG2", abbreviation: "kg2", sector: "KG", sortOrder: 2 },
  { name: "1 ابتدائي", abbreviation: "prim1", sector: "PRIMARY", sortOrder: 3 },
  { name: "2 ابتدائي", abbreviation: "prim2", sector: "PRIMARY", sortOrder: 4 },
  { name: "3 ابتدائي", abbreviation: "prim3", sector: "PRIMARY", sortOrder: 5 },
  { name: "4 ابتدائي", abbreviation: "prim4", sector: "PRIMARY", sortOrder: 6 },
  { name: "5 ابتدائي", abbreviation: "prim5", sector: "PRIMARY", sortOrder: 7 },
  { name: "6 ابتدائي", abbreviation: "prim6", sector: "PRIMARY", sortOrder: 8 },
  { name: "1 إعدادي", abbreviation: "prep1", sector: "PREPARATORY", sortOrder: 9 },
  { name: "2 إعدادي", abbreviation: "prep2", sector: "PREPARATORY", sortOrder: 10 },
  { name: "3 إعدادي", abbreviation: "prep3", sector: "PREPARATORY", sortOrder: 11 },
  { name: "1 ثانوي", abbreviation: "sec1", sector: "SECONDARY", sortOrder: 12 },
  { name: "2 ثانوي", abbreviation: "sec2", sector: "SECONDARY", sortOrder: 13 },
  { name: "3 ثانوي", abbreviation: "sec3", sector: "SECONDARY", sortOrder: 14 },
  { name: "جامعي", abbreviation: "univ", sector: "UNIVERSITY", sortOrder: 15 },
  { name: "خريج", abbreviation: "grad", sector: "GRADUATES", sortOrder: 16 },
] as const;

export function isSectorKey(value: string | null | undefined): value is SectorKey {
  return !!value && SECTORS.some((s) => s.key === value);
}

export function sectorByKey(key: string | null | undefined): SectorDefinition | null {
  if (!key) return null;
  return SECTORS.find((s) => s.key === key) ?? null;
}

export function sectorLabel(key: string | null | undefined): string {
  return sectorByKey(key)?.name ?? "غير مُحدد";
}

export function sectorAbbreviation(key: string | null | undefined): string | null {
  return sectorByKey(key)?.abbreviation ?? null;
}

/** Resolves the stage abbreviation for a legacy/plain Arabic grade value. */
export function phaseDefinitionForGrade(grade: string | null | undefined): PhaseDefinition | null {
  if (!grade) return null;
  const normalized = grade.trim();
  return DEFAULT_PHASES.find((p) => p.name === normalized) ?? null;
}

export function phaseNameForGrade(grade: string | null | undefined): string | null {
  return phaseDefinitionForGrade(grade)?.name ?? null;
}
