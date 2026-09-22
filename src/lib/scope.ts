import { prisma } from "./prisma";
import type { SessionPayload } from "./auth";
import { normalizeRole, type Role } from "./utils";

/**
 * Multi-tenancy + phase isolation.
 *
 * Scope is resolved from the database (not the JWT) so that moving a servant to
 * another stage takes effect immediately, even though sessions live for 30 days.
 */
export type AccessScope = {
  role: Role;
  churchId: string | null;
  /** True when the role may read the whole church (SUPER_ADMIN / CHURCH_ADMIN). */
  churchWide: boolean;
  /** Stage ids the caller may read/write; empty when unrestricted or unassigned. */
  phaseIds: string[];
  /** Sector assigned to a PHASE_ADMIN. */
  sector: string | null;
  /** Single stage assigned to a PHASE_SERVANT or STUDENT. */
  assignedPhaseId: string | null;
  /** True when a scoped role has no assignment yet (legacy data). */
  unassigned: boolean;
};

export async function resolveScope(session: SessionPayload): Promise<AccessScope> {
  const role = normalizeRole(session.role);
  const base: AccessScope = {
    role,
    churchId: session.churchId,
    churchWide: false,
    phaseIds: [],
    sector: null,
    assignedPhaseId: null,
    unassigned: false,
  };

  if (role === "SUPER_ADMIN") return { ...base, churchWide: true };
  if (!session.churchId) return base;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { role: true, sector: true, phaseId: true, churchId: true },
  });
  if (!user || user.churchId !== session.churchId) return base;

  if (role === "CHURCH_ADMIN") return { ...base, churchWide: true };

  if (role === "PHASE_ADMIN") {
    if (!user.sector) return { ...base, sector: null, unassigned: true };
    const phases = await prisma.phase.findMany({
      where: { churchId: session.churchId, sector: user.sector },
      select: { id: true },
    });
    return { ...base, sector: user.sector, phaseIds: phases.map((p) => p.id) };
  }

  // PHASE_SERVANT and STUDENT are pinned to a single stage. Legacy records without
  // an assigned stage fall back to church-wide read scope until an admin assigns one.
  if (!user.phaseId) return { ...base, unassigned: true, churchWide: true };
  return { ...base, assignedPhaseId: user.phaseId, phaseIds: [user.phaseId] };
}

/** Prisma where-fragment that restricts records to the resolved scope. */
export function phaseWhereFragment(scope: AccessScope) {
  if (scope.churchWide) return {};
  return { phaseId: { in: scope.phaseIds } };
}

export function isPhaseInScope(scope: AccessScope, phaseId: string | null | undefined): boolean {
  if (scope.churchWide) return true;
  if (!phaseId) return false;
  return scope.phaseIds.includes(phaseId);
}

/** Restricts a church-scoped request for SUPER_ADMIN, who has no fixed church. */
export function sessionChurchId(session: SessionPayload, requested?: string | null): string | null {
  if (session.role === "SUPER_ADMIN") return requested?.trim() || null;
  return session.churchId;
}
