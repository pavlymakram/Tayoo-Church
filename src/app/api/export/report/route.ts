import { jsonError } from "@/lib/api";
import { requireSession } from "@/lib/auth";
import { buildChurchWorkbook, buildScopeWorkbook } from "@/lib/excel";
import { can, type Capability } from "@/lib/permissions";
import { buildExportPayload } from "@/lib/report";
import { resolveScope } from "@/lib/scope";
import type { Role } from "@/lib/utils";

const EXPORT_ROLES: Role[] = ["SUPER_ADMIN", "CHURCH_ADMIN", "PHASE_ADMIN", "PHASE_SERVANT"];

const SCOPE_CAPABILITY: Record<string, Capability> = {
  church: "exportChurchReport",
  sector: "exportSectorReport",
  phase: "exportPhaseReport",
};

/**
 * Role-scoped Excel engine.
 *
 * CHURCH_ADMIN / SUPER_ADMIN → every stage of the church in sequential order.
 * PHASE_ADMIN               → only the assigned sector (قطاع).
 * PHASE_SERVANT             → only the assigned stage (مرحلة).
 */
export async function GET(req: Request) {
  const { session, error } = await requireSession(EXPORT_ROLES);
  if (error || !session) return error!;

  const { searchParams } = new URL(req.url);
  const churchId = session.role === "SUPER_ADMIN" ? searchParams.get("churchId")?.trim() : session.churchId;
  if (!churchId) return jsonError("لا توجد كنيسة مرتبطة", 400);

  const scope = await resolveScope(session);
  if (scope.role !== "SUPER_ADMIN" && scope.churchId !== churchId) {
    return jsonError("لا تملك صلاحية على هذه الكنيسة", 403);
  }

  const payload = await buildExportPayload(churchId, scope);
  if (!payload) return jsonError("الكنيسة غير موجودة", 404);
  if (!can(scope.role, SCOPE_CAPABILITY[payload.scope] ?? "exportChurchReport")) {
    return jsonError("لا تملك صلاحية التصدير", 403);
  }

  const buffer =
    payload.scope === "church"
      ? await buildChurchWorkbook(payload)
      : await buildScopeWorkbook(payload);

  const filename = encodeURIComponent(`طايو-${payload.church.name}-${payload.scopeLabel}.xlsx`);
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      "Cache-Control": "no-store",
    },
  });
}
