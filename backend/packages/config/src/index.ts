import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const applicationEnvironmentSchema = z.enum([
  "development",
  "test",
  "production"
]);

const logLevelSchema = z.enum(["trace", "debug", "info", "warn", "error"]);
const logFormatSchema = z.enum(["json", "pretty"]);

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().trim().min(1).optional()
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional()
);

/** e-Time Office `LastRecord` / `MaxRecord` format: `MMyyyy$ID` (API Documentation.pdf, API 4). */
export const ETIME_RECORD_PATTERN = /^(0[1-9]|1[0-2])\d{4}\$\d+$/;

/** Documented e-Time Office base URL (API Documentation.pdf, "Base URL"). */
export const ETIME_DEFAULT_BASE_URL = "https://api.etimeoffice.com/api/";

const booleanFlag = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : String(value).trim().toLowerCase()),
  z.enum(["true", "false"]).optional()
).transform((value) => value === "true");

const databaseUrlSchema = z.string().url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  },
  "DATABASE_URL must use the postgres:// or postgresql:// protocol"
);

export const environmentSchema = z
  .object({
    NODE_ENV: applicationEnvironmentSchema.default("development"),
    SERVER_HOST: z.string().trim().min(1).default("0.0.0.0"),
    SERVER_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    DATABASE_URL: databaseUrlSchema,
    SESSION_SECRET: z.string().min(32),
    FRONTEND_ORIGIN: z.string().trim().min(1).optional(),
    FLOOT_ENDPOINT: optionalUrl,
    FLOOT_API_KEY: optionalNonEmptyString,
    LOG_LEVEL: logLevelSchema.default("info"),
    LOG_FORMAT: logFormatSchema.default("json"),
    /**
     * IANA timezone that defines operational days/weeks/months (KPI results).
     * Required in production; development/test fall back to UTC.
     */
    OPERATIONS_TIMEZONE: z
      .string()
      .trim()
      .min(1)
      .refine(isValidIanaTimeZone, { message: "OPERATIONS_TIMEZONE must be a valid IANA timezone (e.g. Asia/Kolkata)" })
      .optional(),
    /**
     * SameSite policy for the session cookie. `lax` suits a same-origin deployment
     * (frontend proxies /api to the backend); `none` is required when the browser
     * calls the backend on a different site and always forces `Secure`.
     */
    SESSION_COOKIE_SAMESITE: z.enum(["lax", "strict", "none"]).default("lax"),
    /**
     * e-Time Office attendance integration (backend only; never exposed to the frontend).
     * Credentials are optional so the API runs without the integration; the poller
     * starts only when ETIME_SYNC_ENABLED=true and all three credentials are set.
     */
    ETIME_BASE_URL: z.preprocess(
      (value) => (value === "" || value === undefined ? ETIME_DEFAULT_BASE_URL : value),
      z.string().url().refine((value) => new URL(value).protocol === "https:", "ETIME_BASE_URL must use https")
    ),
    ETIME_CORPORATE_ID: optionalNonEmptyString,
    ETIME_USERNAME: optionalNonEmptyString,
    ETIME_PASSWORD: optionalNonEmptyString,
    /** Provider-approved first `LastRecord` (`MMyyyy$ID`). Not documented by the provider; no default is invented. */
    ETIME_INITIAL_LAST_RECORD: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().trim().regex(ETIME_RECORD_PATTERN, "ETIME_INITIAL_LAST_RECORD must use the MMyyyy$ID format").optional()
    ),
    ETIME_SYNC_ENABLED: booleanFlag,
    /** `ALL` or one employee code for the incremental poll (API 4 `Empcode`). */
    ETIME_SYNC_EMPCODE: z.preprocess((value) => (value === "" ? undefined : value), z.string().trim().min(1).default("ALL")),
    /** Polling interval: a CRM configuration choice, not a provider requirement. */
    ETIME_POLL_INTERVAL_MINUTES: z.preprocess((value) => (value === "" ? undefined : value), z.coerce.number().int().min(1).max(1440).default(5)),
    ETIME_REQUEST_TIMEOUT_MS: z.preprocess((value) => (value === "" ? undefined : value), z.coerce.number().int().min(1000).max(300_000).default(30_000)),
    /**
     * Date parameter format for DownloadInOutPunchData. The documentation states dd/MM/yyyy_HH:mm for
     * all dates, but this endpoint's example uses dd/MM/yyyy (PROVIDER CONFIRMATION REQUIRED).
     */
    ETIME_INOUT_DATE_FORMAT: z.preprocess((value) => (value === "" ? undefined : value), z.enum(["date", "datetime"]).default("date"))
  })
  .superRefine((value, context) => {
    const hasFlootEndpoint = value.FLOOT_ENDPOINT !== undefined;
    const hasFlootApiKey = value.FLOOT_API_KEY !== undefined;

    if (hasFlootEndpoint !== hasFlootApiKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "FLOOT_ENDPOINT and FLOOT_API_KEY must be configured together",
        path: hasFlootEndpoint ? ["FLOOT_API_KEY"] : ["FLOOT_ENDPOINT"]
      });
    }

    const etimeCredentials = [value.ETIME_CORPORATE_ID, value.ETIME_USERNAME, value.ETIME_PASSWORD];
    const etimeConfigured = etimeCredentials.filter((entry) => entry !== undefined).length;
    if (etimeConfigured !== 0 && etimeConfigured !== 3) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "ETIME_CORPORATE_ID, ETIME_USERNAME and ETIME_PASSWORD must be configured together", path: ["ETIME_CORPORATE_ID"] });
    }
    if (value.ETIME_SYNC_ENABLED && etimeConfigured !== 3) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "ETIME_SYNC_ENABLED requires ETIME_CORPORATE_ID, ETIME_USERNAME and ETIME_PASSWORD", path: ["ETIME_SYNC_ENABLED"] });
    }

    for (const origin of parseAllowedOrigins(value.FRONTEND_ORIGIN ?? "")) {
      const problem = frontendOriginProblem(origin, value.NODE_ENV === "production");
      if (problem) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: `FRONTEND_ORIGIN entry '${origin}' ${problem}`, path: ["FRONTEND_ORIGIN"] });
      }
    }

    if (value.NODE_ENV === "production") {
      if (!value.FRONTEND_ORIGIN) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "FRONTEND_ORIGIN must be set explicitly in production (the exact https origin of the frontend)", path: ["FRONTEND_ORIGIN"] });
      }
      if (!value.OPERATIONS_TIMEZONE) {
        context.addIssue({ code: z.ZodIssueCode.custom, message: "OPERATIONS_TIMEZONE must be set explicitly in production (e.g. Asia/Kolkata)", path: ["OPERATIONS_TIMEZONE"] });
      }
    }
  })
  .transform((value) => ({
    ...value,
    FRONTEND_ORIGIN: value.FRONTEND_ORIGIN ?? DEVELOPMENT_FRONTEND_ORIGIN,
    OPERATIONS_TIMEZONE: value.OPERATIONS_TIMEZONE ?? DEVELOPMENT_OPERATIONS_TIMEZONE
  }));

export type ApplicationConfig = z.infer<typeof environmentSchema>;

/** Development/test fallbacks only; production must configure both explicitly. */
export const DEVELOPMENT_FRONTEND_ORIGIN = "http://localhost:5173";
export const DEVELOPMENT_OPERATIONS_TIMEZONE = "UTC";

export function isValidIanaTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * CORS allowlist entries must be exact origins (scheme://host[:port]) with no
 * wildcard or path; production additionally requires https.
 */
export function frontendOriginProblem(origin: string, isProduction: boolean): string | null {
  if (origin.includes("*")) return "must not contain a wildcard";
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return "is not a valid origin";
  }
  if (url.origin !== origin) return "must be an exact origin like https://crm.example.com (no path or trailing slash)";
  if (isProduction && url.protocol !== "https:") return "must use https in production";
  return null;
}

/**
 * Splits a comma-separated FRONTEND_ORIGIN value into a normalized list of
 * exact-match allowed origins for CORS. Empty/whitespace entries are dropped.
 */
export function parseAllowedOrigins(frontendOrigin: string): string[] {
  if (!frontendOrigin || frontendOrigin.trim() === "") {
    return [];
  }

  return frontendOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export class ConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "ConfigurationError";
  }
}

/**
 * Loads environment variables from the project's root .env file if present,
 * without overwriting variables already present in process.env.
 */
export function loadProjectEnv(customPath?: string): void {
  const possiblePaths = customPath
    ? [customPath]
    : [
        path.resolve(process.cwd(), ".env"),
        path.resolve(process.cwd(), "..", ".env"),
        path.resolve(process.cwd(), "..", "..", ".env")
      ];

  for (const envPath of possiblePaths) {
    if (existsSync(envPath)) {
      if (typeof process.loadEnvFile === "function") {
        try {
          process.loadEnvFile(envPath);
          return;
        } catch {
          // Fall back to manual parser if loadEnvFile fails
        }
      }

      try {
        const content = readFileSync(envPath, "utf8");
        for (const line of content.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith("#")) continue;
          const eqIdx = trimmed.indexOf("=");
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            let val = trimmed.slice(eqIdx + 1).trim();
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              val = val.slice(1, -1);
            }
            if (process.env[key] === undefined) {
              process.env[key] = val;
            }
          }
        }
        return;
      } catch {
        // Ignore file read error
      }
    }
  }
}

/**
 * Validates process environment at application bootstrap. It does not open a
 * database connection or initialise Floot; those concerns remain downstream.
 *
 * Supports PORT (e.g. from Hostinger / Cloud platforms) falling back to SERVER_PORT and default 3000.
 * Supports HOST falling back to SERVER_HOST and default "0.0.0.0".
 */
export function loadConfig(environment: NodeJS.ProcessEnv = process.env): ApplicationConfig {
  const effectiveHost = environment.HOST ?? environment.SERVER_HOST ?? "0.0.0.0";
  const effectivePort = environment.PORT ?? environment.SERVER_PORT ?? "3000";

  const normalizedEnv: NodeJS.ProcessEnv = {
    ...environment,
    SERVER_HOST: effectiveHost,
    SERVER_PORT: String(effectivePort)
  };

  const parsed = environmentSchema.safeParse(normalizedEnv);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");

    throw new ConfigurationError(`Invalid environment configuration: ${issues}`);
  }

  return parsed.data;
}
