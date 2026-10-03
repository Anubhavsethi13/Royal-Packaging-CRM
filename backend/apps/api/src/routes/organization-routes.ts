import type { EmployeeDTO } from "@royal-packaging/contracts";
import {
  createEmployeeRequestSchema,
  createShiftAssignmentRequestSchema,
  updateEmployeeRequestSchema
} from "@royal-packaging/contracts";
import { z } from "zod";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { assertDepotInScope, DepotForbiddenError, depotFilterFor, type DepotDirectory, type DepotScope } from "../middleware/depot-scope.js";
import { BadRequestError, ForbiddenError, NotFoundError } from "../middleware/error-handler.js";
import type { AuthService } from "../modules/identity/auth-service.js";
import type { OrganizationService } from "../modules/organization/organization-service.js";
import type { ApiContext, Router } from "../router.js";
import {
  pageItems,
  parsePagination,
  sendJson,
  sendList,
  sortByKey,
  sortDirection,
  withCamelCaseMirror
} from "../utils/http-utils.js";

const uuidSchema = z.string().uuid({ message: "Must be a valid UUID" });

const EMPLOYEE_SORT_MAP: Record<string, keyof EmployeeDTO> = {
  employee_code: "employee_code",
  employeeCode: "employee_code",
  name: "name",
  department: "department",
  depot_id: "depot_id",
  depotId: "depot_id",
  is_active: "is_active",
  isActive: "is_active",
  created_at: "created_at",
  createdAt: "created_at"
};

export function registerOrganizationRoutes(
  router: Router,
  authService: AuthService,
  organizationService: OrganizationService,
  authPolicy: AuthorizationPolicy,
  directory: DepotDirectory
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  /**
   * Employee visibility: depot-confined callers (Supervisor) see and manage only
   * employees of their own depot; callers without depot authority only their own
   * profile; organisation-wide roles everyone. Decided from the session only.
   */
  const assertEmployeeVisible = async (ctx: ApiContext, scope: DepotScope, employeeId: string): Promise<void> => {
    const employee = await directory.employeeDepot(employeeId);
    if (!employee.exists) return; // the route answers 404
    assertDepotInScope(scope, employee.depotId, "This employee belongs to another depot.");
    if (scope.kind === "self" && (await directory.activeEmployeeOfUser(ctx.user!.id))?.id !== employeeId) {
      throw new ForbiddenError("You may only view your own employee profile.");
    }
  };

  // GET /employees
  router.get("/employees", auth, authz("employee:read"), async (ctx: ApiContext) => {
    const pagination = parsePagination(ctx.query);
    const rawDepartment = ctx.query.get("department");
    const department = rawDepartment && rawDepartment.toLowerCase() !== "all" ? rawDepartment : undefined;
    const depotId = ctx.query.get("depot_id") ?? ctx.query.get("depotId") ?? ctx.query.get("depot") ?? undefined;
    const cleanDepotId = depotId && depotId.toLowerCase() !== "all" ? depotId : undefined;
    const isActiveRaw = ctx.query.get("is_active") ?? ctx.query.get("isActive");
    const statusRaw = ctx.query.get("status");
    let isActive: boolean | undefined = undefined;
    if (isActiveRaw !== null && isActiveRaw !== undefined) {
      isActive = isActiveRaw === "true";
    } else if (statusRaw && statusRaw.toLowerCase() !== "all") {
      isActive = statusRaw.toLowerCase() === "active";
    }
    const search = ctx.query.get("search") ?? undefined;

    const scope = await authPolicy.resolveDepotScope(ctx);
    let allEmployees = await organizationService.listEmployees({
      department,
      depot_id: depotFilterFor(scope, cleanDepotId),
      is_active: isActive,
      search
    });
    if (scope.kind === "self") {
      const own = await directory.activeEmployeeOfUser(ctx.user!.id);
      allEmployees = allEmployees.filter((employee) => employee.id === own?.id);
    }

    const sortBy = ctx.query.get("sortBy") ?? ctx.query.get("sort_by") ?? ctx.query.get("sort");
    const dir = sortDirection(ctx.query, "desc");
    const sortKey = sortBy ? EMPLOYEE_SORT_MAP[sortBy] : undefined;
    const sorted = sortKey ? sortByKey(allEmployees, sortKey, dir) : allEmployees;
    const paged = pageItems(sorted, pagination);

    sendList(ctx.res, withCamelCaseMirror(paged), pagination, sorted.length);
  });

  // POST /employees
  router.post("/employees", auth, authz("employee:write"), async (ctx: ApiContext) => {
    const parseResult = createEmployeeRequestSchema.safeParse(ctx.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    // A depot-confined caller can only add employees to their own depot.
    const depotId = depotFilterFor(await authPolicy.resolveDepotScope(ctx), parseResult.data.depot_id);
    const employee = await organizationService.createEmployee(depotId ? { ...parseResult.data, depot_id: depotId } : parseResult.data);
    sendJson(ctx.res, 201, { success: true, data: withCamelCaseMirror(employee) });
  });

  // GET /employees/:id
  router.get("/employees/:id", auth, authz("employee:read"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id || !uuidSchema.safeParse(id).success) {
      throw new BadRequestError("Invalid employee ID format");
    }
    await assertEmployeeVisible(ctx, await authPolicy.resolveDepotScope(ctx), id);
    const employee = await organizationService.getEmployeeById(id);
    if (!employee) {
      throw new NotFoundError(`Employee with ID '${id}' was not found`);
    }
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(employee) });
  });

  // PATCH /employees/:id
  router.patch("/employees/:id", auth, authz("employee:write"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id || !uuidSchema.safeParse(id).success) {
      throw new BadRequestError("Invalid employee ID format");
    }
    const parseResult = updateEmployeeRequestSchema.safeParse(ctx.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    const scope = await authPolicy.resolveDepotScope(ctx);
    await assertEmployeeVisible(ctx, scope, id);
    // A depot-confined caller cannot move an employee out of their depot.
    if (scope.kind === "depot" && parseResult.data.depot_id !== undefined && parseResult.data.depot_id !== scope.depotId) {
      throw new DepotForbiddenError("You can only assign employees to your own depot.");
    }
    const employee = await organizationService.updateEmployee(id, parseResult.data);
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(employee) });
  });

  // POST /employees/:id/shift-assignments
  router.post("/employees/:id/shift-assignments", auth, authz("employee:assign_shift"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id || !uuidSchema.safeParse(id).success) {
      throw new BadRequestError("Invalid employee ID format");
    }
    const parseResult = createShiftAssignmentRequestSchema.safeParse(ctx.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    await assertEmployeeVisible(ctx, await authPolicy.resolveDepotScope(ctx), id);
    const employee = await organizationService.createShiftAssignment(id, parseResult.data);
    sendJson(ctx.res, 201, { success: true, data: withCamelCaseMirror(employee) });
  });
}
