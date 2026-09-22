import { randomBytes } from "crypto";
import { sectorAbbreviation } from "./phases";
import type { Role } from "./utils";

/**
 * Strict credential generation rules.
 *
 *   CHURCH_ADMIN  → {church}_admin_{5 random digits}
 *   PHASE_ADMIN   → {church}_admin_{sector}_{5 random digits}
 *   PHASE_SERVANT → {church}_{phase}_{5 random digits}
 *   STUDENT       → {church}_user_{5 random digits}
 *
 * `{church}` and `{phase}` are the dynamic English abbreviation codes stored on the
 * Church and Phase records. Underscores are preserved inside the codes so a church
 * coded `mar_girgis` yields `mar_girgis_admin_48291`.
 */

export const ABBREVIATION_PATTERN = /^[a-z][a-z0-9_]{1,29}$/;

export function normalizeAbbreviation(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function isValidAbbreviation(value: string): boolean {
  return ABBREVIATION_PATTERN.test(value);
}

/** Five random digits, never zero-padded so the segment is always 5 wide. */
export function randomDigits(count = 5): string {
  const min = 10 ** (count - 1);
  const span = 9 * min;
  const bytes = randomBytes(4);
  const value = bytes.readUInt32BE(0) % span;
  return String(min + value);
}

export function buildUsername(input: {
  churchAbbreviation: string;
  role: Role;
  phaseAbbreviation?: string | null;
  sector?: string | null;
}): string {
  const church = normalizeAbbreviation(input.churchAbbreviation) || "church";
  const digits = randomDigits(5);
  switch (input.role) {
    case "CHURCH_ADMIN":
      return `${church}_admin_${digits}`;
    case "PHASE_ADMIN": {
      const sector = sectorAbbreviation(input.sector) ?? "sector";
      return `${church}_admin_${sector}_${digits}`;
    }
    case "PHASE_SERVANT": {
      const phase = input.phaseAbbreviation ? normalizeAbbreviation(input.phaseAbbreviation) : "phase";
      return `${church}_${phase}_${digits}`;
    }
    default:
      return `${church}_user_${digits}`;
  }
}

/** Attempts to allocate a username that is not used yet (max 10 attempts). */
export async function allocateUsername(
  build: () => string,
  isTaken: (username: string) => Promise<boolean>
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = build();
    if (!(await isTaken(candidate))) return candidate;
  }
  throw new Error("تعذر توليد اسم مستخدم فريد — حاول مرة أخرى");
}

const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#%*!";
const PASSWORD_LENGTH = 10;

/** Cryptographically random, unambiguous, mixed-character initial password. */
export function generateInitialPassword(length = PASSWORD_LENGTH): string {
  const limit = 256 - (256 % PASSWORD_ALPHABET.length);
  let password = "";
  while (password.length < length) {
    for (const byte of randomBytes(length * 2)) {
      if (byte >= limit) continue;
      password += PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length];
      if (password.length === length) break;
    }
  }
  return password;
}

export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,49}$/;
