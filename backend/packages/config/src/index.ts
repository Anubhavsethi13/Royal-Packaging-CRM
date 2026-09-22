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
    FRONTEND_ORIGIN: z.string().trim().min(1).default("http://localhost:5173"),
    FLOOT_ENDPOINT: optionalUrl,
    FLOOT_API_KEY: optionalNonEmptyString,
    LOG_LEVEL: logLevelSchema.default("info"),
    LOG_FORMAT: logFormatSchema.default("json")
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
  });

export type ApplicationConfig = z.infer<typeof environmentSchema>;

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
