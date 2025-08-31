import { Chunk, Effect, Option, Ref, Schedule } from "effect";
import { getTitleFromPage } from "../../NotionAccessors.js";
import type { NormalizedDatabaseSchema } from "../../NotionSchema.js";
import {
  AppConfig,
  AppConfigProviderLive,
  resolveTitleOverride,
} from "../../config.js";
import type { NotionError } from "../NotionClient/errors.js";
import { InternalServerError } from "../NotionClient/errors.js";
import { NotionClient } from "../NotionClient/service.js";
import {
  getAllPaginatedResults,
  markdownToNotionBlocks,
  normalizeDatabase,
  notionBlocksToMarkdown,
} from "./helpers.js";

export class NotionService extends Effect.Service<NotionService>()(
  "NotionService",
  {
    accessors: true,
    dependencies: [NotionClient.Default, AppConfigProviderLive],
    effect: Effect.gen(function* () {
      const notionClient = yield* NotionClient;
      const { notionApiKey } = yield* AppConfig;

      type CacheEntry = { schema: NormalizedDatabaseSchema; fetchedAt: number };
      const schemaCacheRef = yield* Ref.make(new Map<string, CacheEntry>());
      const SCHEMA_TTL_MS = 10 * 60 * 1000; // 10 minutes

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

          const normalized = normalizeDatabase(db as any);

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

      const getCachedSchema = (
        databaseId: string
      ): Effect.Effect<Option.Option<NormalizedDatabaseSchema>> =>
        Effect.gen(function* () {
          const cache = yield* Ref.get(schemaCacheRef);
          const existing = cache.get(databaseId);
          return existing ? Option.some(existing.schema) : Option.none();
        });

      return {
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
        ) =>
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
              return yield* Effect.fail(err);
            })
          ).pipe(
            Effect.flatMap((schema) =>
              notionClient
                .queryDatabase(notionApiKey, databaseId, {
                  ...(filter !== undefined ? { filter } : {}),
                  ...(sorts !== undefined ? { sorts } : {}),
                  ...(startCursor !== undefined
                    ? { start_cursor: startCursor }
                    : {}),
                  ...(pageSize !== undefined ? { page_size: pageSize } : {}),
                })
                .pipe(
                  Effect.tapError((e) =>
                    Effect.logWarning(
                      `queryDatabase failed for databaseId=${databaseId}; errorTag=${
                        (e as NotionError)?._tag ?? "Unknown"
                      }`
                    )
                  ),
                  Effect.mapError((e) =>
                    typeof (e as { _tag?: unknown })._tag === "string"
                      ? (e as NotionError)
                      : new InternalServerError({ cause: e })
                  ),
                  Effect.map((response: any) => {
                    const titleKey: string | undefined =
                      titlePropertyName ??
                      resolveTitleOverride(databaseId) ??
                      schema.titlePropertyName ??
                      undefined;

                    const results = response.results.map((page: any) => ({
                      id: page.id,
                      title: getTitleFromPage(page, schema, titleKey),
                    }));

                    return {
                      results,
                      hasMore: response.has_more,
                      nextCursor: response.next_cursor,
                    };
                  })
                )
            )
          ),

        listArticlesWithSchema: (
          databaseId: string,
          schema: NormalizedDatabaseSchema,
          titlePropertyName?: string,
          filter?: unknown,
          sorts?: unknown,
          pageSize?: number,
          startCursor?: string
        ) =>
          notionClient
            .queryDatabase(notionApiKey, databaseId, {
              ...(filter !== undefined ? { filter } : {}),
              ...(sorts !== undefined ? { sorts } : {}),
              ...(startCursor !== undefined
                ? { start_cursor: startCursor }
                : {}),
              ...(pageSize !== undefined ? { page_size: pageSize } : {}),
            })
            .pipe(
              Effect.tapError((e) =>
                Effect.logWarning(
                  `queryDatabase failed for databaseId=${databaseId}; errorTag=${
                    (e as NotionError)?._tag ?? "Unknown"
                  }`
                )
              ),
              Effect.mapError((e) =>
                typeof (e as { _tag?: unknown })._tag === "string"
                  ? (e as NotionError)
                  : new InternalServerError({ cause: e })
              ),
              Effect.map((response: any) => {
                const titleKey: string | undefined =
                  titlePropertyName ??
                  resolveTitleOverride(databaseId) ??
                  schema.titlePropertyName ??
                  undefined;

                const results = response.results.map((page: any) => ({
                  id: page.id,
                  title: getTitleFromPage(page, schema, titleKey),
                }));

                return {
                  results,
                  hasMore: response.has_more,
                  nextCursor: response.next_cursor,
                };
              })
            ),

        listPagesWithSchema: (
          databaseId: string,
          _schema: NormalizedDatabaseSchema,
          filter?: unknown,
          sorts?: unknown,
          pageSize?: number,
          startCursor?: string
        ) =>
          notionClient
            .queryDatabase(notionApiKey, databaseId, {
              ...(filter !== undefined ? { filter } : {}),
              ...(sorts !== undefined ? { sorts } : {}),
              ...(startCursor !== undefined
                ? { start_cursor: startCursor }
                : {}),
              ...(pageSize !== undefined ? { page_size: pageSize } : {}),
            })
            .pipe(
              Effect.tapError((e) =>
                Effect.logWarning(
                  `queryDatabase failed for databaseId=${databaseId}; errorTag=${
                    (e as NotionError)?._tag ?? "Unknown"
                  }`
                )
              ),
              Effect.mapError((e) =>
                typeof (e as { _tag?: unknown })._tag === "string"
                  ? (e as NotionError)
                  : new InternalServerError({ cause: e })
              ),
              Effect.map((response: any) => ({
                pages: response.results as ReadonlyArray<any>,
                hasMore: response.has_more,
                nextCursor: response.next_cursor,
              }))
            ),

        getArticleMetadata: (pageId: string) =>
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
            Effect.map((page: any) => ({
              properties: page.properties as unknown,
            }))
          ),

        getArticleContent: (pageId: string) =>
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

        updateArticleContent: (pageId: string, content: string) =>
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
            const blockIds = (
              existingBlocks as ReadonlyArray<{ id: string }>
            ).map((b) => b.id);

            // Use bounded concurrency to respect Notion API rate limits
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
                  Effect.catchAll(() => Effect.void)
                ),
              { concurrency: 5 }
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
