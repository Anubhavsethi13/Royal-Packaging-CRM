import { createPayrollApprovalRequestSchema, createPayrollEntryRequestSchema } from "@royal-packaging/contracts";
import { z } from "zod";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { BadRequestError, NotFoundError } from "../middleware/error-handler.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { PayrollService } from "../modules/payroll/payroll-service.js";
import type { ApiContext, Router } from "../router.js";
import { sendJson, withCamelCaseMirror } from "../utils/http-utils.js";

const uuidSchema = z.string().uuid({ message: "Must be a valid UUID" });

export function registerPayrollRoutes(
  router: Router,
  authService: AuthService,
  payrollService: PayrollService,
  authPolicy: AuthorizationPolicy
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  // GET /payroll
  router.get("/payroll", auth, authz("payroll:read"), async (ctx: ApiContext) => {
    const status = ctx.query.get("status") ?? undefined;
    const employeeId = ctx.query.get("employee_id") ?? undefined;
    const entries = await payrollService.listEntries({ status: status as never, employee_id: employeeId });
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(entries) });
  });

  // GET /payroll/:id
  router.get("/payroll/:id", auth, authz("payroll:read"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id || !uuidSchema.safeParse(id).success) {
      throw new BadRequestError("Invalid payroll entry ID format");
    }
    const entry = await payrollService.getEntryById(id);
    if (!entry) {
      throw new NotFoundError(`Payroll entry with ID '${id}' was not found`);
    }
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(entry) });
  });

  // POST /payroll/entries
  router.post("/payroll/entries", auth, authz("payroll:write"), async (ctx: ApiContext) => {
    const parseResult = createPayrollEntryRequestSchema.safeParse(ctx.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    const entry = await payrollService.createEntry(parseResult.data);
    sendJson(ctx.res, 201, { success: true, data: withCamelCaseMirror(entry) });
  });

  // POST /payroll/entries/:id/approvals
  router.post("/payroll/entries/:id/approvals", auth, authz("payroll:approve"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id || !uuidSchema.safeParse(id).success) {
      throw new BadRequestError("Invalid payroll entry ID format");
    }
    const parseResult = createPayrollApprovalRequestSchema.safeParse(ctx.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    const entry = await payrollService.recordApproval(id, ctx.user!.id, parseResult.data);
    sendJson(ctx.res, 201, { success: true, data: withCamelCaseMirror(entry) });
  });
}
