import { Data, Effect } from "effect";
import type { EntityAdapter } from "../adapters/Adapter.js";
import { getAdapter } from "../adapters/registry.js";
import type { BaseEntity } from "../logical/Common.js";
import { applyDefaults, loadSourcesConfig, validateConfig } from "./config.js";

export type Kind = "articles" | "changelog" | "projects";

export type SourceConfig<E extends BaseEntity = BaseEntity> = {
  alias: string;
  databaseId: string;
  kind: Kind;
  adapter: EntityAdapter<E>;
  capabilities: {
    update: boolean;
    delete: boolean;
  };
  description?: string;
};

/**
 * Error thrown when a requested source is not found in the registry.
 */
export class SourceNotFoundError extends Data.TaggedError(
  "SourceNotFoundError",
)<{
  readonly kind: Kind;
  readonly alias: string;
}> {}

/**
 * Error thrown when source configuration is invalid.
 */
export class SourceConfigError extends Data.TaggedError("SourceConfigError")<{
  readonly message: string;
}> {}

/**
 * Loads source configurations from JSON config file with environment variable substitution.
 *
 * Configuration file location is determined by:
 * 1. NOTION_SOURCES_CONFIG environment variable
 * 2. Default: ./sources.config.json
 *
 * Sources with empty database IDs after env var substitution are skipped with a warning.
 * Sources with missing adapters are skipped with an error.
 *
 * @returns Array of valid source configurations
 */
function processConfigSource(
  item: unknown,
  defaults: unknown,
): SourceConfig | undefined {
  // biome-ignore lint/suspicious/noExplicitAny: type bridge for dynamic config loading
  const processed = applyDefaults(item as any, defaults as any) as {
    databaseId: string;
    alias: string;
    kind: Kind;
    adapter: string;
    capabilities: { update: boolean; delete: boolean };
    description?: string;
  };

  // Skip if database ID is empty after env var substitution
  if (!processed.databaseId || processed.databaseId.trim().length === 0) {
    console.warn(
      `[Sources] Skipping source '${processed.alias}': database ID not configured (check environment variables)`,
    );
    return undefined;
  }

  // Lookup adapter from registry
  const adapter = getAdapter(processed.kind, processed.adapter);
  if (!adapter) {
    console.error(
      `[Sources] No adapter found for ${processed.kind}/${processed.adapter} (source: ${processed.alias})`,
    );
    console.error(
      `[Sources] Skipping source '${processed.alias}'. Register the adapter in src/domain/adapters/registry.ts`,
    );
    return undefined;
  }

  const sourceConfig: SourceConfig = {
    alias: processed.alias,
    databaseId: processed.databaseId,
    kind: processed.kind,
    adapter,
    capabilities: processed.capabilities,
  };

  if (processed.description !== undefined) {
    sourceConfig.description = processed.description;
  }

  return sourceConfig;
}

function logLoadedSources(sources: ReadonlyArray<SourceConfig>) {
  if (sources.length > 0) {
    console.log(`[Sources] Loaded ${sources.length} source(s):`);
    for (const s of sources) {
      const caps = `update=${s.capabilities.update}, delete=${s.capabilities.delete}`;
      const desc = s.description ? ` - ${s.description}` : "";
      console.log(`  - ${s.kind}/${s.alias} (${caps})${desc}`);
    }
  } else {
    console.warn(
      "[Sources] No sources configured. Check sources.config.json and environment variables.",
    );
  }
}

const loadFromConfig = (): ReadonlyArray<SourceConfig> => {
  const configPath =
    process.env.NOTION_SOURCES_CONFIG || "./sources.config.json";

  // Load and validate config file
  const configEffect = loadSourcesConfig(configPath).pipe(
    Effect.tap((config) => validateConfig(config)),
    Effect.catchAll((error) => {
      console.warn(
        `[Sources] Failed to load config from ${configPath}: ${error.message}`,
      );
      console.warn("[Sources] Falling back to empty source list");
      return Effect.succeed({ version: "1.0", sources: [] });
    }),
  );

  const result = Effect.runSync(configEffect);

  const sources: SourceConfig[] = result.sources
    .map((item) =>
      processConfigSource(
        item,
        "defaults" in result ? result.defaults : undefined,
      ),
    )
    .filter((source): source is SourceConfig => source !== undefined);

  logLoadedSources(sources);

  return sources;
};

/**
 * Cached source registry loaded at module initialization.
 * Prevents repeated configuration parsing on every request.
 *
 * Sources are loaded from JSON config file (sources.config.json) with
 * environment variable substitution for database IDs.
 */
const SOURCES_CACHE: ReadonlyArray<SourceConfig> = loadFromConfig();

/**
 * Source registry for managing configured Notion database sources.
 *
 * Sources are loaded from JSON configuration at module initialization
 * and cached for performance. Use Effect-based methods for error handling.
 *
 * Configuration is loaded from:
 * - File specified in NOTION_SOURCES_CONFIG env var, or
 * - Default: ./sources.config.json
 */
export const Sources = {
  /**
   * Returns all configured sources.
   */
  all: (): ReadonlyArray<SourceConfig> => SOURCES_CACHE,

  /**
   * Returns sources filtered by kind.
   */
  ofKind(kind: Kind): ReadonlyArray<SourceConfig> {
    return SOURCES_CACHE.filter((s) => s.kind === kind);
  },

  /**
   * Resolves a source by kind and alias, throwing if not found.
   *
   * @deprecated Use `resolveEffect` for proper Effect error handling
   */
  resolve(kind: Kind, alias: string): SourceConfig {
    const s = SOURCES_CACHE.find((s) => s.kind === kind && s.alias === alias);
    if (!s) {
      throw new Error(`Unknown source: ${kind}/${alias}`);
    }
    return s;
  },

  /**
   * Resolves a source by kind and alias using Effect error channel.
   *
   * @returns Effect that succeeds with SourceConfig or fails with SourceNotFoundError
   */
  resolveEffect(
    kind: Kind,
    alias: string,
  ): Effect.Effect<SourceConfig, SourceNotFoundError> {
    const s = SOURCES_CACHE.find((s) => s.kind === kind && s.alias === alias);
    if (!s) {
      return Effect.fail(new SourceNotFoundError({ kind, alias }));
    }
    return Effect.succeed(s);
  },
};
