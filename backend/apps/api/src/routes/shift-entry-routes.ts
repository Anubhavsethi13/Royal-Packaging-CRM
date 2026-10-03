import { listShiftEntriesFilterSchema } from "@royal-packaging/contracts";
import { z } from "zod";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { assertDepotInScope, type DepotDirectory } from "../middleware/depot-scope.js";
import { BadRequestError, UnauthorizedError } from "../middleware/error-handler.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { ShiftEntryService } from "../modules/shift-entries/shift-entry-service.js";
import type { ApiContext, Router } from "../router.js";
import { parsePagination, sendJson, sendList, withCamelCaseMirror } from "../utils/http-utils.js";

const uuidSchema = z.string().uuid({ message: "Must be a valid UUID" });

export function registerShiftEntryRoutes(
  router: Router,
  authService: AuthService,
  shiftEntryService: ShiftEntryService,
  authPolicy: AuthorizationPolicy,
  directory: DepotDirectory
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  // POST /shift-entries - the employee is derived from the session, never the body.
  router.post("/shift-entries", auth, authz("shift:create"), async (ctx: ApiContext) => {
    const user = requireUser(ctx);
    const entry = await shiftEntryService.create(user.id, ctx.body);
    sendJson(ctx.res, 201, { success: true, data: withCamelCaseMirror(entry) });
  });

  // GET /shift-entries/options - selectable warehouses and truck types for the entry form.
  router.get("/shift-entries/options", auth, authz("shift:create"), async (ctx: ApiContext) => {
    const options = await shiftEntryService.listOptions();
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(options) });
  });

  // GET /shift-entries/me - registered before /:id so "me" is never parsed as an ID.
  router.get("/shift-entries/me", auth, authz("shift:read_own"), async (ctx: ApiContext) => {
    const user = requireUser(ctx);
    const pagination = parsePagination(ctx.query);
    const filter = listShiftEntriesFilterSchema.parse({
      from: ctx.query.get("from") ?? undefined,
      to: ctx.query.get("to") ?? undefined
    });
    const page = await shiftEntryService.listForUser(user.id, filter, {
      limit: pagination.pageSize,
      offset: pagination.offset
    });
    sendList(ctx.res, withCamelCaseMirror(page.items), pagination, page.total);
  });

  // GET /shift-entries/:id - owner or management (enforced by the "shift:read" policy).
  router.get("/shift-entries/:id", auth, validateId, authz("shift:read"), async (ctx: ApiContext) => {
    const entry = await shiftEntryService.getByIdOrThrow(ctx.params.id as string);
    // A Supervisor may read entries of employees of their own depot only.
    assertDepotInScope(await authPolicy.resolveDepotScope(ctx), (await directory.employeeDepot(entry.employee_id)).depotId, "This shift entry belongs to an employee of another depot.");
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(entry) });
  });
}

function requireUser(ctx: ApiContext): NonNullable<ApiContext["user"]> {
  if (!ctx.user) {
    throw new UnauthorizedError("Authentication required.");
  }
  return ctx.user;
}

async function validateId(ctx: ApiContext, next: () => Promise<void>): Promise<void> {
  const id = ctx.params.id;
  if (!id || !uuidSchema.safeParse(id).success) {
    throw new BadRequestError("Invalid shift entry ID format");
  }
  await next();
}
