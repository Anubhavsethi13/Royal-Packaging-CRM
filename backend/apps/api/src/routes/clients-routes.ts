import type { ClientDTO } from "@royal-packaging/contracts";
import { createClientRequestSchema, updateClientRequestSchema } from "@royal-packaging/contracts";
import { z } from "zod";
import {
  type AuthorizationPolicy,
  requireAuth,
  requireAuthorization
} from "../middleware/auth-middleware.js";
import { BadRequestError, NotFoundError } from "../middleware/error-handler.js";
import type { ClientsService } from "../modules/clients/clients-service.js";
import type { AuthService } from "../modules/identity/auth-service.js";
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

const CLIENT_SORT_MAP: Record<string, keyof ClientDTO> = {
  name: "name",
  account_code: "account_code",
  accountCode: "account_code",
  contact_name: "contact_name",
  contactName: "contact_name",
  phone: "phone",
  status: "status",
  created_at: "created_at",
  createdAt: "created_at"
};

export function registerClientsRoutes(
  router: Router,
  authService: AuthService,
  clientsService: ClientsService,
  authPolicy: AuthorizationPolicy
): void {
  const auth = requireAuth(authService);
  const authz = (action: string) => requireAuthorization(authPolicy, action);

  // GET /clients
  router.get("/clients", auth, authz("client:read"), async (ctx: ApiContext) => {
    const pagination = parsePagination(ctx.query);
    const rawStatus = ctx.query.get("status");
    const status = rawStatus && rawStatus.toLowerCase() !== "all"
      ? (rawStatus.toLowerCase() as "active" | "inactive")
      : undefined;
    const search = ctx.query.get("search") ?? undefined;

    const allClients = await clientsService.listClients({ status, search });
    const sortBy = ctx.query.get("sortBy") ?? ctx.query.get("sort_by") ?? ctx.query.get("sort");
    const dir = sortDirection(ctx.query, "desc");
    const sortKey = sortBy ? CLIENT_SORT_MAP[sortBy] : undefined;
    const sorted = sortKey ? sortByKey(allClients, sortKey, dir) : allClients;
    const paged = pageItems(sorted, pagination);

    sendList(ctx.res, withCamelCaseMirror(paged), pagination, sorted.length);
  });

  // POST /clients
  router.post("/clients", auth, authz("client:write"), async (ctx: ApiContext) => {
    const parseResult = createClientRequestSchema.safeParse(ctx.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    const client = await clientsService.createClient(parseResult.data);
    sendJson(ctx.res, 201, { success: true, data: withCamelCaseMirror(client) });
  });

  // GET /clients/:id
  router.get("/clients/:id", auth, authz("client:read"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id || !uuidSchema.safeParse(id).success) {
      throw new BadRequestError("Invalid client ID format");
    }
    const client = await clientsService.getClientById(id);
    if (!client) {
      throw new NotFoundError(`Client with ID '${id}' was not found`);
    }
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(client) });
  });

  // PATCH /clients/:id
  router.patch("/clients/:id", auth, authz("client:write"), async (ctx: ApiContext) => {
    const id = ctx.params.id;
    if (!id || !uuidSchema.safeParse(id).success) {
      throw new BadRequestError("Invalid client ID format");
    }
    const parseResult = updateClientRequestSchema.safeParse(ctx.body);
    if (!parseResult.success) {
      throw parseResult.error;
    }
    const client = await clientsService.updateClient(id, parseResult.data);
    sendJson(ctx.res, 200, { success: true, data: withCamelCaseMirror(client) });
  });
}
