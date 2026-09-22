import type { ApiContext, Middleware } from "../router.js";
import { HttpError } from "./error-handler.js";

/**
 * In-memory, fixed-window rate limiter.
 *
 * KNOWN LIMITATION (flagged, not silently accepted): this limiter keeps its
 * counters in process memory. It is correct for a single API instance only.
 * If this service is ever scaled horizontally behind a load balancer, each
 * instance enforces its own independent limit, so the effective aggregate
 * limit becomes (limit * instance count). A distributed limiter (e.g.
 * Redis-backed) would be required at that point. See
 * docs/integration/backend-frontend-reconciliation.md.
 */
export class InMemoryRateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly counters = new Map<string, { count: number; windowStart: number }>();

  public constructor(config: { windowMs: number; maxRequests: number }) {
    this.windowMs = config.windowMs;
    this.maxRequests = config.maxRequests;
  }

  /**
   * Consumes one request unit for `key`. Returns whether the request is
   * allowed under the current fixed window, resetting the window when it has
   * elapsed.
   */
  public consume(key: string, now: number = Date.now()): { allowed: boolean; remaining: number; resetAt: number } {
    const existing = this.counters.get(key);

    if (!existing || now - existing.windowStart >= this.windowMs) {
      this.counters.set(key, { count: 1, windowStart: now });
      return { allowed: true, remaining: this.maxRequests - 1, resetAt: now + this.windowMs };
    }

    if (existing.count >= this.maxRequests) {
      return { allowed: false, remaining: 0, resetAt: existing.windowStart + this.windowMs };
    }

    existing.count += 1;
    return {
      allowed: true,
      remaining: this.maxRequests - existing.count,
      resetAt: existing.windowStart + this.windowMs
    };
  }

  /** Removes expired window entries to bound memory growth. */
  public sweep(now: number = Date.now()): void {
    for (const [key, entry] of this.counters.entries()) {
      if (now - entry.windowStart >= this.windowMs) {
        this.counters.delete(key);
      }
    }
  }
}

/**
 * Resolves the rate-limit bucket key for a request: authenticated users are
 * limited per user ID, anonymous requests per remote address.
 */
export function resolveClientKey(ctx: ApiContext): string {
  if (ctx.user?.id) {
    return `user:${ctx.user.id}`;
  }
  const remoteAddress = ctx.req.socket.remoteAddress ?? "unknown";
  return `ip:${remoteAddress}`;
}

/** Middleware factory enforcing a rate limit, failing with HTTP 429 when exceeded. */
export function rateLimit(limiter: InMemoryRateLimiter): Middleware {
  return async (ctx: ApiContext, next: () => Promise<void>) => {
    const key = resolveClientKey(ctx);
    const result = limiter.consume(key);

    if (!result.allowed) {
      throw new HttpError(
        429,
        "RATE_LIMITED",
        "Too many requests. Please slow down and try again shortly.",
        { resetAt: new Date(result.resetAt).toISOString() }
      );
    }

    await next();
  };
}
