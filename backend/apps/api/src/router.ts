import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuthenticatedUser } from "@royal-packaging/contracts";
import { DEFAULT_SESSION_COOKIE_NAME } from "./modules/identity/session.js";
import { parseCookies, parseJsonBody } from "./utils/http-utils.js";
import { handleApiError, NotFoundError } from "./middleware/error-handler.js";

export interface ApiContext {
  readonly req: IncomingMessage;
  readonly res: ServerResponse;
  readonly method: string;
  readonly url: URL;
  readonly path: string;
  readonly params: Record<string, string>;
  readonly query: URLSearchParams;
  readonly cookies: Record<string, string>;
  readonly correlationId: string;
  readonly idempotencyKey: string | null;
  body: unknown;
  user: AuthenticatedUser | null;
  sessionToken: string | null;
}

export type RouteHandler = (ctx: ApiContext) => Promise<void> | void;
export type Middleware = (ctx: ApiContext, next: () => Promise<void>) => Promise<void> | void;

/** CORS configuration for an exact-origin credentialed allowlist. */
export interface CorsOptions {
  readonly allowedOrigins: readonly string[];
  readonly allowCredentials?: boolean;
}

interface RouteDefinition {
  readonly method: string;
  readonly pattern: RegExp;
  readonly paramNames: string[];
  readonly middlewares: Middleware[];
  readonly handler: RouteHandler;
}

export class Router {
  private readonly routes: RouteDefinition[] = [];
  private readonly globalMiddlewares: Middleware[] = [];
  private corsOptions: CorsOptions | null = null;

  public use(middleware: Middleware): this {
    this.globalMiddlewares.push(middleware);
    return this;
  }

  /** Configures the exact-origin CORS allowlist applied to every request. */
  public configureCors(options: CorsOptions): this {
    this.corsOptions = options;
    return this;
  }

  public get(path: string, ...handlers: [...Middleware[], RouteHandler]): this {
    return this.addRoute("GET", path, handlers);
  }

  public post(path: string, ...handlers: [...Middleware[], RouteHandler]): this {
    return this.addRoute("POST", path, handlers);
  }

  public put(path: string, ...handlers: [...Middleware[], RouteHandler]): this {
    return this.addRoute("PUT", path, handlers);
  }

  public patch(path: string, ...handlers: [...Middleware[], RouteHandler]): this {
    return this.addRoute("PATCH", path, handlers);
  }

  public delete(path: string, ...handlers: [...Middleware[], RouteHandler]): this {
    return this.addRoute("DELETE", path, handlers);
  }

  private addRoute(method: string, path: string, handlers: [...Middleware[], RouteHandler]): this {
    const handler = handlers[handlers.length - 1] as RouteHandler;
    const middlewares = handlers.slice(0, handlers.length - 1) as Middleware[];
    const { pattern, paramNames } = compilePath(path);

    this.routes.push({
      method: method.toUpperCase(),
      pattern,
      paramNames,
      middlewares,
      handler
    });

    return this;
  }

  /**
   * Dispatches an HTTP request to matching route and executes middleware chain.
   */
  public async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Correlation ID is computed first so it can be echoed back on every
    // response, including 404s, CORS preflights, and unhandled errors.
    const correlationId =
      (typeof req.headers["x-correlation-id"] === "string" ? req.headers["x-correlation-id"] : null) ??
      crypto.randomUUID();

    res.setHeader("X-Correlation-Id", correlationId);
    applySecurityHeaders(res);
    this.applyCors(req, res);

    const method = (req.method ?? "GET").toUpperCase();

    // CORS preflight requests are short-circuited before any route matching,
    // body parsing, or authentication.
    if (method === "OPTIONS") {
      res.writeHead(204, { "Content-Length": "0" });
      res.end();
      return;
    }

    try {
      const host = req.headers.host ?? "localhost";
      const fullUrl = new URL(req.url ?? "/", `http://${host}`);
      const pathname = fullUrl.pathname;

      // Strip a leading /api prefix so both /api/foo and /foo resolve to the
      // same route table (Assumption: frontend base URL may or may not
      // include /api - see reconciliation doc).
      const routePath = stripApiPrefix(pathname);

      // Match route
      let matchedRoute: RouteDefinition | null = null;
      let matchedParams: Record<string, string> = {};

      for (const route of this.routes) {
        if (route.method !== method) continue;
        const match = route.pattern.exec(routePath);
        if (match) {
          matchedRoute = route;
          matchedParams = {};
          for (let i = 0; i < route.paramNames.length; i++) {
            const paramName = route.paramNames[i];
            if (paramName) {
              matchedParams[paramName] = decodeURIComponent(match[i + 1] ?? "");
            }
          }
          break;
        }
      }

      if (!matchedRoute) {
        throw new NotFoundError(`Cannot ${method} ${pathname}`);
      }

      // Parse headers / cookies
      const cookieHeader = req.headers.cookie;
      const cookies = parseCookies(cookieHeader);
      const idempotencyKey =
        (typeof req.headers["idempotency-key"] === "string" ? req.headers["idempotency-key"] : null);

      // Parse JSON body for mutation methods
      let body: unknown = {};
      if (method === "POST" || method === "PUT" || method === "PATCH") {
        body = await parseJsonBody(req);
      }

      const ctx: ApiContext = {
        req,
        res,
        method,
        url: fullUrl,
        path: routePath,
        params: matchedParams,
        query: fullUrl.searchParams,
        cookies,
        correlationId,
        idempotencyKey,
        body,
        user: null,
        sessionToken: cookies[DEFAULT_SESSION_COOKIE_NAME] ?? null
      };

      // Compose pipeline: global middlewares -> route middlewares -> route handler
      const pipeline: Middleware[] = [
        ...this.globalMiddlewares,
        ...matchedRoute.middlewares,
        async (c: ApiContext) => {
          await matchedRoute!.handler(c);
        }
      ];

      let index = 0;
      const next = async (): Promise<void> => {
        if (index < pipeline.length) {
          const current = pipeline[index++];
          if (current) {
            await current(ctx, next);
          }
        }
      };

      await next();
    } catch (err) {
      handleApiError(err, res, correlationId);
    }
  }

  /**
   * Applies an exact-origin, credentialed CORS allowlist. Only origins in
   * `corsOptions.allowedOrigins` receive a matching `Access-Control-Allow-Origin`;
   * all others get no CORS headers (browsers then block the response), which
   * fails closed rather than reflecting an arbitrary Origin.
   */
  private applyCors(req: IncomingMessage, res: ServerResponse): void {
    if (!this.corsOptions) {
      return;
    }

    const origin = req.headers.origin;
    if (typeof origin !== "string" || !this.corsOptions.allowedOrigins.includes(origin)) {
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    if (this.corsOptions.allowCredentials !== false) {
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");

    const requestedHeaders = req.headers["access-control-request-headers"];
    res.setHeader(
      "Access-Control-Allow-Headers",
      typeof requestedHeaders === "string"
        ? requestedHeaders
        : "Content-Type, Authorization, X-Correlation-Id, Idempotency-Key"
    );
    res.setHeader("Access-Control-Max-Age", "600");
  }
}

/** Sets baseline defensive HTTP security headers on every response. */
export function applySecurityHeaders(res: ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
}

/** Strips a leading /api prefix so /api/foo and /foo both resolve identically. */
function stripApiPrefix(pathname: string): string {
  if (pathname === "/api") {
    return "/";
  }
  if (pathname.startsWith("/api/")) {
    return pathname.slice(4);
  }
  return pathname;
}

/**
 * Compiles a path string like '/tasks/:id/assignments' into a RegExp and parameter names.
 */
function compilePath(path: string): { pattern: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const normalized = path.replace(/\/+$/, "") || "/";

  const regexStr = normalized
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));
        return "([^/]+)";
      }
      return escapeRegex(segment);
    })
    .join("/");

  const pattern = new RegExp(`^${regexStr}$`, "i");
  return { pattern, paramNames };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
