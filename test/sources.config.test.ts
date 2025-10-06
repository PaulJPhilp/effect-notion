import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { Effect } from "effect";
import { loadSourcesConfig, applyDefaults, validateConfig } from "../src/domain/registry/config.js";
import { getAdapter } from "../src/domain/adapters/registry.js";
import { writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = "/tmp/effect-notion-config-tests";

describe("Sources Configuration Loading", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up test files
    try {
      unlinkSync(join(TEST_DIR, "valid.json"));
    } catch {}
    try {
      unlinkSync(join(TEST_DIR, "invalid.json"));
    } catch {}
    try {
      unlinkSync(join(TEST_DIR, "envvar.json"));
    } catch {}
  });

  it("should load and parse valid config", async () => {
    const configPath = join(TEST_DIR, "valid.json");
    const config = {
      version: "1.0",
      sources: [
        {
          alias: "blog",
          kind: "articles" as const,
          databaseId: "abc123",
          adapter: "blog",
        },
      ],
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));

    const result = await Effect.runPromise(loadSourcesConfig(configPath));

    expect(result.version).toBe("1.0");
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.alias).toBe("blog");
    expect(result.sources[0]?.kind).toBe("articles");
    expect(result.sources[0]?.databaseId).toBe("abc123");
  });

  it("should substitute environment variables", async () => {
    const configPath = join(TEST_DIR, "envvar.json");
    const testDbId = "test-db-id-12345";
    process.env.TEST_DB_ID = testDbId;

    const config = {
      version: "1.0",
      sources: [
        {
          alias: "test",
          kind: "articles" as const,
          databaseId: "${TEST_DB_ID}",
        },
      ],
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));

    const result = await Effect.runPromise(loadSourcesConfig(configPath));

    expect(result.sources[0]?.databaseId).toBe(testDbId);

    delete process.env.TEST_DB_ID;
  });

  it("should fail on invalid schema", async () => {
    const configPath = join(TEST_DIR, "invalid.json");
    const config = {
      version: "1.0",
      sources: [
        {
          alias: "invalid-kind",
          kind: "invalid-type", // Invalid kind
          databaseId: "abc123",
        },
      ],
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));

    const result = await Effect.runPromise(
      loadSourcesConfig(configPath).pipe(Effect.either)
    );

    expect(result._tag).toBe("Left");
  });

  it("should fail on missing file", async () => {
    const result = await Effect.runPromise(
      loadSourcesConfig("/nonexistent/file.json").pipe(Effect.either)
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain("Failed to read config file");
    }
  });
});

describe("applyDefaults", () => {
  it("should use explicit values when provided", () => {
    const item = {
      alias: "test",
      kind: "articles" as const,
      databaseId: "123",
      adapter: "custom",
      capabilities: { update: false, delete: false },
    };

    const result = applyDefaults(item, undefined);

    expect(result.adapter).toBe("custom");
    expect(result.capabilities.update).toBe(false);
    expect(result.capabilities.delete).toBe(false);
  });

  it("should apply kind defaults when values not provided", () => {
    const item = {
      alias: "test",
      kind: "articles" as const,
      databaseId: "123",
    };

    const defaults = {
      articles: {
        adapter: "blog",
        capabilities: { update: true, delete: true },
      },
    };

    const result = applyDefaults(item, defaults);

    expect(result.adapter).toBe("blog");
    expect(result.capabilities.update).toBe(true);
    expect(result.capabilities.delete).toBe(true);
  });

  it("should use fallback defaults when no kind defaults exist", () => {
    const item = {
      alias: "test",
      kind: "articles" as const,
      databaseId: "123",
    };

    const result = applyDefaults(item, undefined);

    expect(result.adapter).toBe("default");
    expect(result.capabilities.update).toBe(true);
    expect(result.capabilities.delete).toBe(true);
  });

  it("should preserve description when provided", () => {
    const item = {
      alias: "test",
      kind: "articles" as const,
      databaseId: "123",
      description: "Test description",
    };

    const result = applyDefaults(item, undefined);

    expect(result.description).toBe("Test description");
  });

  it("should not add description when not provided", () => {
    const item = {
      alias: "test",
      kind: "articles" as const,
      databaseId: "123",
    };

    const result = applyDefaults(item, undefined);

    expect(result.description).toBeUndefined();
  });
});

describe("validateConfig", () => {
  it("should pass with valid sources", async () => {
    const config = {
      version: "1.0",
      sources: [
        {
          alias: "blog",
          kind: "articles" as const,
          databaseId: "abc123",
        },
      ],
    };

    const result = await Effect.runPromise(
      validateConfig(config).pipe(Effect.either)
    );

    expect(result._tag).toBe("Right");
  });

  it("should fail with no valid sources", async () => {
    const config = {
      version: "1.0",
      sources: [
        {
          alias: "test",
          kind: "articles" as const,
          databaseId: "",
        },
      ],
    };

    const result = await Effect.runPromise(
      validateConfig(config).pipe(Effect.either)
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain("No valid sources configured");
    }
  });

  it("should fail with duplicate aliases", async () => {
    const config = {
      version: "1.0",
      sources: [
        {
          alias: "blog",
          kind: "articles" as const,
          databaseId: "abc123",
        },
        {
          alias: "blog",
          kind: "articles" as const,
          databaseId: "def456",
        },
      ],
    };

    const result = await Effect.runPromise(
      validateConfig(config).pipe(Effect.either)
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain("Duplicate source alias found: blog");
    }
  });
});

describe("Environment-Specific Configurations", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    try {
      unlinkSync(join(TEST_DIR, "dev.json"));
    } catch {}
    try {
      unlinkSync(join(TEST_DIR, "prod.json"));
    } catch {}
  });

  it("should load development config with write capabilities", async () => {
    const configPath = join(TEST_DIR, "dev.json");
    const config = {
      version: "1.0",
      sources: [
        {
          alias: "blog",
          kind: "articles" as const,
          databaseId: "dev-db-123",
          adapter: "blog",
          capabilities: { update: true, delete: true },
          description: "Development blog (read/write)",
        },
      ],
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    const result = await Effect.runPromise(loadSourcesConfig(configPath));

    expect(result.sources[0]?.capabilities.update).toBe(true);
    expect(result.sources[0]?.capabilities.delete).toBe(true);
  });

  it("should load production config with read-only capabilities", async () => {
    const configPath = join(TEST_DIR, "prod.json");
    const config = {
      version: "1.0",
      sources: [
        {
          alias: "blog",
          kind: "articles" as const,
          databaseId: "prod-db-456",
          adapter: "blog",
          capabilities: { update: false, delete: false },
          description: "Production blog (read-only)",
        },
      ],
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    const result = await Effect.runPromise(loadSourcesConfig(configPath));

    expect(result.sources[0]?.capabilities.update).toBe(false);
    expect(result.sources[0]?.capabilities.delete).toBe(false);
  });

  it("should handle multiple env vars in single config", async () => {
    const configPath = join(TEST_DIR, "multi-env.json");
    process.env.TEST_DB_1 = "database-one";
    process.env.TEST_DB_2 = "database-two";

    const config = {
      version: "1.0",
      sources: [
        {
          alias: "source1",
          kind: "articles" as const,
          databaseId: "${TEST_DB_1}",
        },
        {
          alias: "source2",
          kind: "articles" as const,
          databaseId: "${TEST_DB_2}",
        },
      ],
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    const result = await Effect.runPromise(loadSourcesConfig(configPath));

    expect(result.sources[0]?.databaseId).toBe("database-one");
    expect(result.sources[1]?.databaseId).toBe("database-two");

    delete process.env.TEST_DB_1;
    delete process.env.TEST_DB_2;
  });

  it("should substitute missing env var to empty string", async () => {
    const configPath = join(TEST_DIR, "missing-env.json");
    const config = {
      version: "1.0",
      sources: [
        {
          alias: "test",
          kind: "articles" as const,
          databaseId: "${MISSING_ENV_VAR}",
        },
      ],
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    const result = await Effect.runPromise(loadSourcesConfig(configPath));

    expect(result.sources[0]?.databaseId).toBe("");
  });
});

describe("Adapter Registry", () => {
  it("should retrieve blog adapter for articles", () => {
    const adapter = getAdapter("articles", "blog");
    expect(adapter).toBeDefined();
    expect(adapter).not.toBeNull();
  });

  it("should retrieve default adapter when specific not found", () => {
    const adapter = getAdapter("articles", "nonexistent");
    expect(adapter).toBeDefined();
    expect(adapter).not.toBeNull();
  });

  it("should return null for unsupported kind", () => {
    const adapter = getAdapter("changelog", "any");
    expect(adapter).toBeNull();
  });

  it("should return null for projects kind (not implemented)", () => {
    const adapter = getAdapter("projects", "any");
    expect(adapter).toBeNull();
  });

  it("should use default adapter when adapter name is 'default'", () => {
    const adapter = getAdapter("articles", "default");
    expect(adapter).toBeDefined();
    expect(adapter).not.toBeNull();
  });
});

describe("Edge Cases and Error Handling", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    try {
      unlinkSync(join(TEST_DIR, "malformed.json"));
    } catch {}
    try {
      unlinkSync(join(TEST_DIR, "empty-sources.json"));
    } catch {}
    try {
      unlinkSync(join(TEST_DIR, "no-version.json"));
    } catch {}
  });

  it("should fail on malformed JSON", async () => {
    const configPath = join(TEST_DIR, "malformed.json");
    writeFileSync(configPath, "{ invalid json content }");

    const result = await Effect.runPromise(
      loadSourcesConfig(configPath).pipe(Effect.either)
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left.message).toContain("Failed to read config file");
    }
  });

  it("should handle empty sources array", async () => {
    const configPath = join(TEST_DIR, "empty-sources.json");
    const config = {
      version: "1.0",
      sources: [],
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    const result = await Effect.runPromise(loadSourcesConfig(configPath));

    expect(result.sources).toHaveLength(0);
  });

  it("should require version field", async () => {
    const configPath = join(TEST_DIR, "no-version.json");
    const config = {
      sources: [
        {
          alias: "test",
          kind: "articles" as const,
          databaseId: "123",
        },
      ],
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));

    const result = await Effect.runPromise(
      loadSourcesConfig(configPath).pipe(Effect.either)
    );

    expect(result._tag).toBe("Left");
  });

  it("should merge capabilities when partial is provided", () => {
    const item = {
      alias: "test",
      kind: "articles" as const,
      databaseId: "123",
      capabilities: { update: true },
    };

    const defaults = {
      articles: {
        adapter: "blog",
        capabilities: { update: false, delete: true },
      },
    };

    const result = applyDefaults(item, defaults);

    // Explicit value should override default
    expect(result.capabilities.update).toBe(true);
    // Missing values in partial should be filled from defaults
    expect(result.capabilities.delete).toBe(true);
  });

  it("should handle config with only defaults section", async () => {
    const configPath = join(TEST_DIR, "only-defaults.json");
    const config = {
      version: "1.0",
      sources: [],
      defaults: {
        articles: {
          adapter: "blog",
          capabilities: { update: true, delete: true },
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));
    const result = await Effect.runPromise(loadSourcesConfig(configPath));

    expect(result.sources).toHaveLength(0);
    expect("defaults" in result).toBe(true);
  });

  it("should validate that alias is non-empty string", async () => {
    const configPath = join(TEST_DIR, "empty-alias.json");
    const config = {
      version: "1.0",
      sources: [
        {
          alias: "",
          kind: "articles" as const,
          databaseId: "123",
        },
      ],
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));

    const result = await Effect.runPromise(
      loadSourcesConfig(configPath).pipe(Effect.either)
    );

    expect(result._tag).toBe("Left");
  });

  it("should validate that databaseId is a string", async () => {
    const configPath = join(TEST_DIR, "invalid-dbid.json");
    const config = {
      version: "1.0",
      sources: [
        {
          alias: "test",
          kind: "articles" as const,
          databaseId: 12345, // Should be string
        },
      ],
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2));

    const result = await Effect.runPromise(
      loadSourcesConfig(configPath).pipe(Effect.either)
    );

    expect(result._tag).toBe("Left");
  });
});
