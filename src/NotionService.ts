import { Chunk, Effect, Option, Ref, Schedule } from "effect";
import { lexer } from "marked";
import { getTitleFromPage } from "./NotionAccessors.js";
import type { NotionError } from "./NotionClient.js";
import { InternalServerError, NotionClient } from "./NotionClient.js";
import type {
  Block,
  Database,
  NormalizedDatabaseSchema,
  NotionBlockInput,
} from "./NotionSchema.js";
import {
  AppConfig,
  AppConfigProviderLive,
  resolveTitleOverride,
} from "./config.js";

// =============================================================================
// Transformation Logic
// =============================================================================

const getText = (richText: ReadonlyArray<{ plain_text: string }>): string =>
  richText.map((t) => t.plain_text).join("");

const notionBlocksToMarkdown = (blocks: ReadonlyArray<Block>): string => {
  const markdownLines = blocks.map((block) => {
    switch (block.type) {
      case "paragraph":
        return getText(block.paragraph.rich_text);
      case "heading_2":
        return `## ${getText(block.heading_2.rich_text)}`;
      case "bulleted_list_item":
        return `* ${getText(block.bulleted_list_item.rich_text)}`;
      case "code":
        return [
          `\`\`\`${block.code.language || ""}`,
          getText(block.code.rich_text),
          "```",
        ].join("\n");
    }
  });
  return markdownLines.join("\n\n");
};

const markdownToNotionBlocks = (
  markdown: string
): ReadonlyArray<NotionBlockInput> => {
  const tokens = lexer(markdown);
  const blocks: Array<NotionBlockInput> = [];

  for (const token of tokens) {
    switch (token.type) {
      case "heading":
        if (token.depth === 2) {
          blocks.push({
            object: "block",
            type: "heading_2",
            heading_2: { rich_text: [{ text: { content: token.text } }] },
          });
        }
        break;
      case "paragraph":
        blocks.push({
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ text: { content: token.text } }] },
        });
        break;
      case "list":
        for (const item of token.items) {
          blocks.push({
            object: "block",
            type: "bulleted_list_item",
            bulleted_list_item: {
              rich_text: [{ text: { content: item.text } }],
            },
          });
        }
        break;
      case "code":
        blocks.push({
          object: "block",
          type: "code",
          code: {
            rich_text: [{ text: { content: token.text } }],
            language: token.lang || "plain text",
          },
        });
        break;
    }
  }
  return blocks;
};

// =============================================================================
// 3. Service Definition
// =============================================================================

export class NotionService extends Effect.Service<NotionService>()(
  "NotionService",
  {
    accessors: true,
    dependencies: [NotionClient.Default, AppConfigProviderLive],
    effect: Effect.gen(function* () {
      const notionClient = yield* NotionClient;
      const { notionApiKey } = yield* AppConfig;

      // -----------------------------------------------------------------------------
      // Runtime database schema discovery & cache
      // -----------------------------------------------------------------------------
      type CacheEntry = { schema: NormalizedDatabaseSchema; fetchedAt: number };
      const schemaCacheRef = yield* Ref.make(new Map<string, CacheEntry>());
      const SCHEMA_TTL_MS = 10 * 60 * 1000; // 10 minutes

      const hashString = (input: string): string => {
        let h = 5381;
        for (let i = 0; i < input.length; i++) {
          h = (h * 33) ^ input.charCodeAt(i);
        }
        return (h >>> 0).toString(16);
      };

      const normalizeDatabase = (
        database: Database
      ): NormalizedDatabaseSchema => {
        const entries = Object.entries(database.properties);
        const properties = entries.map(([name, value]) => ({
          name,
          type: value?.type ?? "unknown",
          config: value,
        }));
        const titleProp = properties.find((p) => p.type === "title");
        const propertiesHash = hashString(
          JSON.stringify(
            properties.map((p) => ({ name: p.name, type: p.type }))
          )
        );
        return {
          databaseId: database.id,
          titlePropertyName: titleProp ? titleProp.name : null,
          properties,
          lastEditedTime: database.last_edited_time,
          propertiesHash,
        };
      };

      const getNormalizedSchema = (
        databaseId: string
      ): Effect.Effect<NormalizedDatabaseSchema, NotionError> =>
        Effect.gen(function* () {
          const now = Date.now();
          const cache = yield* Ref.get(schemaCacheRef);
          const existing = cache.get(databaseId);
          if (existing && now - existing.fetchedAt < SCHEMA_TTL_MS) {
            return existing.schema;
          }

          // Attempt to retrieve fresh schema. On failure, propagate error.
          const db = yield* notionClient
            .retrieveDatabase(notionApiKey, databaseId)
            .pipe(
              Effect.tapError((e) =>
                Effect.logWarning(
                  `retrieveDatabase failed for databaseId=${databaseId}; errorTag=${
                    (e as NotionError)?._tag ?? "Unknown"
                  }`
                )
              ),
              Effect.mapError((e) =>
                typeof (e as { _tag?: unknown })._tag === "string"
                  ? (e as NotionError)
                  : new InternalServerError({ cause: e })
              )
            );

          const normalized = normalizeDatabase(db);

          // Invalidate/replace if changed
          if (
            existing &&
            (existing.schema.propertiesHash !== normalized.propertiesHash ||
              existing.schema.lastEditedTime !== normalized.lastEditedTime)
          ) {
            yield* Effect.logInfo(
              `Schema changed for database ${databaseId}; lastEditedTime=${normalized.lastEditedTime}`
            );
          }
          cache.set(databaseId, { schema: normalized, fetchedAt: now });
          yield* Ref.set(schemaCacheRef, cache);
          return normalized;
        });

      // Expose stale cache so callers can decide to fallback
      const getCachedSchema = (
        databaseId: string
      ): Effect.Effect<Option.Option<NormalizedDatabaseSchema>> =>
        Effect.gen(function* () {
          const cache = yield* Ref.get(schemaCacheRef);
          const existing = cache.get(databaseId);
          return existing ? Option.some(existing.schema) : Option.none();
        });

      const invalidateSchema = (databaseId: string): Effect.Effect<void> =>
        Ref.update(schemaCacheRef, (m) => {
          m.delete(databaseId);
          return m;
        });

      // Simple pagination loop accumulating all results
      const getAllPaginatedResults = <
        T extends {
          has_more: boolean;
          next_cursor: Option.Option<string>;
          results: ReadonlyArray<unknown>;
        }
      >(
        fetchFn: (cursor?: string) => Effect.Effect<T, NotionError>
      ): Effect.Effect<ReadonlyArray<T["results"][number]>, NotionError> =>
        Effect.gen(function* () {
          let cursor: string | undefined = undefined;
          let all: Array<T["results"][number]> = [];
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const page: T = yield* fetchFn(cursor);
            all = all.concat(Array.from(page.results));
            if (!page.has_more) break;
            cursor = Option.getOrUndefined(page.next_cursor);
            if (!cursor) break;
          }
          return all as ReadonlyArray<T["results"][number]>;
        });

      // Accessors are centralized in NotionAccessors.ts

      return {
        // Expose normalized schema retrieval to callers for validation and UI
        // decisions. Errors propagate; callers decide on fallbacks.
        getDatabaseSchema: (
          databaseId: string
        ): Effect.Effect<NormalizedDatabaseSchema, NotionError> =>
          getNormalizedSchema(databaseId),

        listArticles: (
          databaseId: string,
          titlePropertyName?: string,
          filter?: unknown,
          sorts?: unknown,
          pageSize?: number,
          startCursor?: string
        ): Effect.Effect<
          {
            results: ReadonlyArray<{ id: string; title: string }>;
            hasMore: boolean;
            nextCursor: Option.Option<string>;
          },
          NotionError
        > =>
          // Discover schema first (and cache it). If fetching fails, optionally
          // fall back to stale cache; otherwise propagate error.
          Effect.catchAll(getNormalizedSchema(databaseId), (err) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(
                `getNormalizedSchema failed for databaseId=${databaseId}; falling back to stale cache if available; errorTag=${
                  (err as NotionError)?._tag ?? "Unknown"
                }`
              );
              const cached = yield* getCachedSchema(databaseId);
              if (Option.isSome(cached)) {
                return cached.value;
              }
              // No cache, re-fail with detailed context
              return yield* Effect.fail(err);
            })
          ).pipe(
            Effect.flatMap((schema) =>
              notionClient
                .queryDatabase(notionApiKey, databaseId, {
                  filter,
                  sorts,
                  start_cursor: startCursor,
                  page_size: pageSize,
                })
                .pipe(
                  Effect.tapError((e) =>
                    Effect.logWarning(
                      `queryDatabase failed for databaseId=${databaseId}; errorTag=${
                        (e as NotionError)?._tag ?? "Unknown"
                      }`
                    )
                  ),
                  // Ensure only NotionError escapes
                  Effect.mapError((e) =>
                    typeof (e as { _tag?: unknown })._tag === "string"
                      ? (e as NotionError)
                      : new InternalServerError({ cause: e })
                  ),
                  Effect.map((response) => {
                    const titleKey: string | undefined =
                      titlePropertyName ??
                      resolveTitleOverride(databaseId) ??
                      schema.titlePropertyName ??
                      undefined;
                    if (!titleKey) {
                      void Effect.runPromise(
                        Effect.logWarning(
                          `Title property not found in schema for database ${databaseId}; using fallback "Untitled"`
                        )
                      );
                    }
                    const results = response.results.map((page) => {
                      const title = getTitleFromPage(page, schema, titleKey);
                      // If schema said there is a title property but we couldn't
                      // decode it, trigger invalidation for next time.
                      if (schema.titlePropertyName && title === "Untitled") {
                        void Effect.runPromise(
                          Effect.zipRight(
                            Effect.logWarning(
                              `Failed to decode title for page ${page.id}; invalidating schema cache for ${databaseId}`
                            ),
                            invalidateSchema(databaseId)
                          )
                        );
                      }
                      return { id: page.id, title };
                    });
                    return {
                      results,
                      hasMore: response.has_more,
                      nextCursor: response.next_cursor,
                    };
                  })
                )
            )
          ),

        getArticleContent: (
          pageId: string
        ): Effect.Effect<string, NotionError> =>
          getAllPaginatedResults((cursor) =>
            notionClient
              .retrieveBlockChildren(notionApiKey, pageId, cursor)
              .pipe(
                Effect.tapError((e) =>
                  Effect.logWarning(
                    `retrieveBlockChildren failed for pageId=${pageId}; cursor=${
                      cursor ?? "<none>"
                    }; errorTag=${(e as NotionError)?._tag ?? "Unknown"}`
                  )
                ),
                Effect.mapError((e) =>
                  typeof (e as { _tag?: unknown })._tag === "string"
                    ? (e as NotionError)
                    : new InternalServerError({ cause: e })
                )
              )
          ).pipe(Effect.map(notionBlocksToMarkdown)),

        getArticleMetadata: (
          pageId: string
        ): Effect.Effect<{ properties: unknown }, NotionError> =>
          notionClient.retrievePage(notionApiKey, pageId).pipe(
            Effect.tapError((e) =>
              Effect.logWarning(
                `retrievePage failed for pageId=${pageId}; errorTag=${
                  (e as NotionError)?._tag ?? "Unknown"
                }`
              )
            ),
            Effect.mapError((e) =>
              typeof (e as { _tag?: unknown })._tag === "string"
                ? (e as NotionError)
                : new InternalServerError({ cause: e })
            ),
            Effect.map((page) => ({ properties: page.properties as unknown }))
          ),

        updateArticleContent: (
          pageId: string,
          content: string
        ): Effect.Effect<void, NotionError> =>
          Effect.gen(function* () {
            const existingBlocks = yield* getAllPaginatedResults((cursor) =>
              notionClient
                .retrieveBlockChildren(notionApiKey, pageId, cursor)
                .pipe(
                  Effect.tapError((e: NotionError) =>
                    Effect.logWarning(
                      `retrieveBlockChildren failed during update for pageId=${pageId}; cursor=${
                        cursor ?? "<none>"
                      }; errorTag=${e._tag ?? "Unknown"}`
                    )
                  ),
                  Effect.mapError((e) =>
                    typeof (e as { _tag?: unknown })._tag === "string"
                      ? (e as NotionError)
                      : new InternalServerError({ cause: e })
                  )
                )
            );
            const blockIds = existingBlocks.map((b: { id: string }) => b.id);

            yield* Effect.forEach(
              blockIds,
              (id) =>
                notionClient.deleteBlock(notionApiKey, id).pipe(
                  Effect.tapError((e) =>
                    Effect.logWarning(
                      `deleteBlock failed for pageId=${pageId}; blockId=${id}; errorTag=${
                        (e as NotionError)?._tag ?? "Unknown"
                      }`
                    )
                  ),
                  // Swallow delete errors so we can continue updating content.
                  // This handles archived/locked blocks and transient failures gracefully.
                  Effect.catchAll(() => Effect.void)
                ),
              { concurrency: "unbounded" }
            );

            const newBlocks = markdownToNotionBlocks(content);

            const batches = Chunk.chunksOf(Chunk.fromIterable(newBlocks), 100);
            yield* Effect.forEach(
              batches,
              (batch) =>
                notionClient
                  .appendBlockChildren(
                    notionApiKey,
                    pageId,
                    Chunk.toReadonlyArray(batch)
                  )
                  .pipe(
                    Effect.tapError((e) =>
                      Effect.logWarning(
                        `appendBlockChildren failed for pageId=${pageId}; batchSize=${Chunk.size(
                          batch
                        )}; errorTag=${(e as NotionError)?._tag ?? "Unknown"}`
                      )
                    ),
                    // Retry up to 3 total attempts (initial + 2 retries) with exponential backoff
                    (eff) =>
                      Effect.retry(eff, Schedule.exponential(100)).pipe(
                        Effect.retry(Schedule.recurs(2))
                      )
                  ),
              { concurrency: 1 }
            );
          }).pipe(Effect.asVoid),
      };
    }),
  }
) {}
