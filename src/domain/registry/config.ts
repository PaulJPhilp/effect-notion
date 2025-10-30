import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Effect, Schema } from "effect";
import type { Kind } from "./sources.js";

/**
 * Effect Schema for source capabilities
 */
const CapabilitiesSchema = Schema.Struct({
  update: Schema.Boolean,
  delete: Schema.Boolean,
});

/**
 * Effect Schema for a single source configuration item
 */
const SourceConfigItemSchema = Schema.Struct({
  alias: Schema.String.pipe(
    Schema.pattern(/^[a-z][a-z0-9-]*$/),
    Schema.minLength(1),
  ),
  kind: Schema.Literal("articles", "changelog", "projects"),
  databaseId: Schema.String.pipe(Schema.minLength(1)),
  adapter: Schema.optional(Schema.String),
  capabilities: Schema.optional(CapabilitiesSchema),
  description: Schema.optional(Schema.String),
});

/**
 * Effect Schema for kind defaults
 */
const DefaultsSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Struct({
    adapter: Schema.optional(Schema.String),
    capabilities: Schema.optional(CapabilitiesSchema),
  }),
});

/**
 * Effect Schema for the complete sources configuration file
 */
const SourcesConfigSchema = Schema.Struct({
  version: Schema.String,
  sources: Schema.Array(SourceConfigItemSchema),
  defaults: Schema.optional(DefaultsSchema),
});

/**
 * TypeScript types derived from schemas
 */
export type SourceConfigItem = Schema.Schema.Type<
  typeof SourceConfigItemSchema
>;
export type SourcesConfig = Schema.Schema.Type<typeof SourcesConfigSchema>;
export type Capabilities = Schema.Schema.Type<typeof CapabilitiesSchema>;

/**
 * Substitutes environment variable placeholders like ${VAR_NAME} with actual values.
 *
 * @param value - String that may contain ${ENV_VAR} placeholders
 * @returns String with placeholders replaced by environment variable values
 *
 * @example
 * ```typescript
 * process.env.MY_DB = "abc123";
 * substituteEnvVars("${MY_DB}") // returns "abc123"
 * substituteEnvVars("prefix-${MY_DB}-suffix") // returns "prefix-abc123-suffix"
 * ```
 */
const substituteEnvVars = (value: string): string => {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const envValue = process.env[envVar];
    if (!envValue) {
      console.warn(
        `[Config] Environment variable ${envVar} not set, using empty string`,
      );
      return "";
    }
    return envValue;
  });
};

/**
 * Loads and validates sources configuration from a JSON file.
 *
 * This function:
 * 1. Reads the JSON file from the specified path
 * 2. Validates it against the SourcesConfigSchema
 * 3. Substitutes environment variable placeholders in databaseId fields
 * 4. Returns the processed configuration
 *
 * @param configPath - Path to the configuration file (relative or absolute)
 * @returns Effect that succeeds with validated config or fails with Error
 *
 * @example
 * ```typescript
 * const config = await Effect.runPromise(
 *   loadSourcesConfig("./sources.config.json")
 * );
 * ```
 */
export const loadSourcesConfig = (
  configPath = "./sources.config.json",
): Effect.Effect<SourcesConfig, Error> =>
  Effect.gen(function* () {
    // Resolve to absolute path
    const absolutePath = resolve(configPath);

    // Read config file with defensive error handling
    // In production/serverless, file operations can be unreliable
    let rawConfig: unknown;
    try {
      // Add a basic check before attempting to read
      const fileContent = readFileSync(absolutePath, "utf-8");
      if (!fileContent || fileContent.trim().length === 0) {
        return yield* Effect.fail(
          new Error(`Config file at ${absolutePath} is empty`),
        );
      }
      rawConfig = JSON.parse(fileContent);
    } catch (err) {
      // Provide more detailed error information
      const errorMsg =
        err instanceof Error ? err.message : String(err);
      return yield* Effect.fail(
        new Error(
          `Failed to read config file at ${absolutePath}: ${errorMsg}`,
        ),
      );
    }

    // Validate schema
    const parseResult =
      Schema.decodeUnknownEither(SourcesConfigSchema)(rawConfig);
    if (parseResult._tag === "Left") {
      return yield* Effect.fail(
        new Error(
          `Invalid config schema in ${absolutePath}: ${String(parseResult.left)}`,
        ),
      );
    }

    const config = parseResult.right;

    // Substitute environment variables in databaseId fields
    const processedSources = config.sources.map((source) => ({
      ...source,
      databaseId: substituteEnvVars(source.databaseId),
    }));

    return {
      ...config,
      sources: processedSources,
    };
  });

/**
 * Applies default values to a source configuration item.
 *
 * Priority order:
 * 1. Explicitly set values in the source item
 * 2. Kind-specific defaults from config
 * 3. Hardcoded fallback defaults
 *
 * @param item - Source configuration item to process
 * @param defaults - Optional default values per kind from config file
 * @returns Source item with all required fields populated
 *
 * @example
 * ```typescript
 * const item = {
 *   alias: "blog",
 *   kind: "articles",
 *   databaseId: "abc123"
 * };
 * const defaults = {
 *   articles: {
 *     adapter: "blog",
 *     capabilities: { update: true, delete: true }
 *   }
 * };
 * const result = applyDefaults(item, defaults);
 * // result.adapter === "blog"
 * // result.capabilities === { update: true, delete: true }
 * ```
 */
export const applyDefaults = (
  item: SourceConfigItem,
  defaults: unknown,
): {
  alias: string;
  kind: Kind;
  databaseId: string;
  adapter: string;
  capabilities: Capabilities;
  description?: string;
} => {
  // Cast defaults to a more flexible type for lookup
  const defaultsMap = defaults as
    | Record<
        string,
        {
          adapter?: string;
          capabilities?: { update: boolean; delete: boolean };
        }
      >
    | undefined;
  const kindDefaults = defaultsMap?.[item.kind];

  // Fallback defaults if nothing specified
  const fallbackCapabilities: Capabilities = {
    update: true,
    delete: true,
  };

  const result = {
    alias: item.alias,
    kind: item.kind,
    databaseId: item.databaseId,
    adapter: item.adapter || kindDefaults?.adapter || "default",
    capabilities: {
      update:
        item.capabilities?.update ??
        kindDefaults?.capabilities?.update ??
        fallbackCapabilities.update,
      delete:
        item.capabilities?.delete ??
        kindDefaults?.capabilities?.delete ??
        fallbackCapabilities.delete,
    },
  };

  // Only include description if it's defined
  if (item.description !== undefined) {
    return { ...result, description: item.description };
  }

  return result;
};

/**
 * Validates that a configuration has at least one valid source.
 *
 * A source is considered invalid if its databaseId is empty after env var substitution.
 *
 * @param config - The loaded configuration
 * @returns Effect that succeeds if config is valid, fails with descriptive error otherwise
 */
export const validateConfig = (
  config: SourcesConfig,
): Effect.Effect<void, Error> =>
  Effect.gen(function* () {
    // Filter out sources with empty database IDs
    const validSources = config.sources.filter(
      (s) => s.databaseId && s.databaseId.trim().length > 0,
    );

    if (validSources.length === 0) {
      return yield* Effect.fail(
        new Error(
          "No valid sources configured. Ensure environment variables are set for database IDs.",
        ),
      );
    }

    // Check for duplicate aliases
    const aliases = new Set<string>();
    for (const source of config.sources) {
      if (aliases.has(source.alias)) {
        return yield* Effect.fail(
          new Error(`Duplicate source alias found: ${source.alias}`),
        );
      }
      aliases.add(source.alias);
    }

    return yield* Effect.succeed(undefined);
  });
