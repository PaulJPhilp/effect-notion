import dotenv from "dotenv";
import * as fs from "node:fs";
import * as path from "node:path";
// src/config.ts
import {
  Config,
  ConfigProvider,
  Context,
  Data,
  Effect,
  Layer,
  LogLevel,
} from "effect";

// Define the schema for our application's configuration
export type Env = "development" | "test" | "production";

// Load env files in priority order allowing later files to override earlier ones.
// Order: .env -> .env.local -> .env.<env> -> .env.<env>.local
const loadEnvFiles = (env: Env): void => {
  const cwd = process.cwd();
  const files = [
    path.join(cwd, ".env"),
    path.join(cwd, ".env.local"),
    path.join(cwd, `.env.${env}`),
    path.join(cwd, `.env.${env}.local`),
  ];
  // First file seeds values; subsequent files can override
  files.forEach((file, idx) => {
    if (fs.existsSync(file)) {
      dotenv.config({ path: file, override: idx > 0 });
    }
  });
};

// Determine env early and load files
const NODE_ENV: Env = (process.env.NODE_ENV as Env) ?? "development";
loadEnvFiles(NODE_ENV);

export const AppConfig = Config.all({
  env: Config.string("NODE_ENV").pipe(
    Config.withDefault(NODE_ENV),
    Config.map((s) =>
      s === "test" || s === "production" ? s : ("development" as Env)
    )
  ),
  port: Config.number("PORT").pipe(Config.withDefault(3000)),
  corsOrigin: Config.string("CORS_ORIGIN").pipe(Config.withDefault("*")),
  corsAllowedMethods: Config.string("CORS_ALLOWED_METHODS").pipe(
    Config.withDefault("POST,GET,OPTIONS")
  ),
  corsAllowedHeaders: Config.string("CORS_ALLOWED_HEADERS").pipe(
    Config.withDefault("Content-Type,Authorization")
  ),
  logLevel: Config.logLevel("LOG_LEVEL").pipe(
    Config.withDefault(LogLevel.Info)
  ),
  // Optional, but required in production for integration paths.
  notionApiKey: Config.string("NOTION_API_KEY").pipe(Config.withDefault("")),
  // HTTP client timeout for Notion requests (milliseconds)
  notionHttpTimeoutMs: Config.number("NOTION_HTTP_TIMEOUT_MS").pipe(
    Config.withDefault(10000)
  ),
});

// Provide a ConfigProvider that sources from process env with defaults
export const AppConfigProviderLive = Layer.setConfigProvider(
  ConfigProvider.fromEnv()
);

// Perform additional validation beyond parsing.
// - In production, NOTION_API_KEY must be present.
export const ValidatedAppConfig = Effect.gen(function* () {
  const cfg = yield* AppConfig;
  if (
    cfg.env === "production" &&
    (!cfg.notionApiKey || cfg.notionApiKey.length === 0)
  ) {
    class ConfigValidationError extends Data.TaggedError(
      "ConfigValidationError"
    )<{
      readonly reason: string;
    }> {}

    return yield* Effect.fail(
      new ConfigValidationError({
        reason: "NOTION_API_KEY is required in production environment",
      })
    );
  }
  return cfg;
});

// ----------------------------------------------------------------------------
// CORS Configuration Helper
// ----------------------------------------------------------------------------
export function buildCorsOptions(cfg: {
  readonly corsOrigin: string;
  readonly corsAllowedMethods: string;
  readonly corsAllowedHeaders: string;
}) {
  return {
    allowedOrigins: [cfg.corsOrigin],
    allowedMethods: cfg.corsAllowedMethods.split(",").map((s) => s.trim()),
    allowedHeaders: cfg.corsAllowedHeaders.split(",").map((s) => s.trim()),
  } as const;
}

// ----------------------------------------------------------------------------
// Logical Field Overrides Service
// ----------------------------------------------------------------------------
/**
 * Service for managing per-database field name overrides.
 * 
 * Allows mapping from application logical field names to actual Notion
 * property names on a per-database basis. This is useful when different
 * databases use different property names for the same logical concept.
 * 
 * Example: Database A uses "Name" for title, Database B uses "Title"
 */
export type LogicalFieldMap = Readonly<Record<string, string>>;

export class LogicalFieldOverridesService extends Context.Tag(
  "LogicalFieldOverridesService"
)<
  LogicalFieldOverridesService,
  {
    readonly overrides: ReadonlyMap<string, LogicalFieldMap>;
  }
>() {
  /**
   * Live layer with empty overrides.
   * 
   * For production use, provide a custom layer with your database-specific
   * overrides using `LogicalFieldOverridesService.make()`.
   */
  static readonly Live = Layer.succeed(this, {
    overrides: new Map<string, LogicalFieldMap>(),
  });

  /**
   * Creates a layer with specific field overrides.
   * 
   * @example
   * ```typescript
   * const CustomOverrides = LogicalFieldOverridesService.make({
   *   "db-id-123": { title: "Name", slug: "Slug" },
   *   "db-id-456": { title: "Title", slug: "URL" }
   * });
   * ```
   */
  static make(
    overrides: Record<string, LogicalFieldMap>
  ): Layer.Layer<LogicalFieldOverridesService> {
    return Layer.succeed(this, {
      overrides: new Map(Object.entries(overrides)),
    });
  }
}

/**
 * Resolves a logical field name to the actual Notion property name
 * for a specific database.
 * 
 * @param databaseId - The Notion database ID
 * @param logicalField - The logical field name (e.g., "title", "slug")
 * @returns Effect that yields the property name or undefined
 */
export const resolveLogicalField = (
  databaseId: string,
  logicalField: string
): Effect.Effect<string | undefined, never, LogicalFieldOverridesService> =>
  Effect.gen(function* () {
    const service = yield* LogicalFieldOverridesService;
    const dbOverrides = service.overrides.get(databaseId);
    return dbOverrides?.[logicalField];
  });

/**
 * Resolves the title field override for a specific database.
 * 
 * @param databaseId - The Notion database ID
 * @returns Effect that yields the title property name or undefined
 */
export const resolveTitleOverride = (
  databaseId: string
): Effect.Effect<string | undefined, never, LogicalFieldOverridesService> =>
  resolveLogicalField(databaseId, "title");
