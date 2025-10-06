import { Chunk, Clock, Effect, Option, Ref, Schedule } from "effect";
import { getTitleFromPage } from "../../NotionAccessors.js";
import type { NormalizedDatabaseSchema } from "../../NotionSchema.js";
import {
  AppConfig,
  AppConfigProviderLive,
  LogicalFieldOverridesService,
  resolveTitleOverride,
} from "../../config.js";
import type { NotionError } from "../NotionClient/errors.js";
import { InternalServerError, mapToNotionError } from "../NotionClient/errors.js";
import { NotionClient } from "../NotionClient/service.js";
import {
  buildNotionPropertiesFromSimpleSpec,
  getAllPaginatedResults,
  markdownToNotionBlocks,
  normalizeDatabase,
  notionBlocksToMarkdown,
} from "./helpers.js";

export class NotionService extends Effect.Service<NotionService>()(
  "NotionService",
  {
    accessors: true,
    dependencies: [
      NotionClient.Default,
      AppConfigProviderLive,
      LogicalFieldOverridesService.Live,
    ],
    effect: Effect.gen(function* () {
      const notionClient = yield* NotionClient;
      const fieldOverrides = yield* LogicalFieldOverridesService;

      type CacheEntry = {
        schema: NormalizedDatabaseSchema;
        fetchedAt: number;
        lastAccessedAt: number;
        hits: number;
        refreshes: number;
        staleReads: number;
      };
      const schemaCacheRef = yield* Ref.make(new Map<string, CacheEntry>());
      const SCHEMA_TTL_MS = 10 * 60 * 1000; // 10 minutes
      const MAX_CACHE_SIZE = 100; // LRU eviction at 100 entries

      /**
       * Evicts least recently used cache entries when size exceeds MAX_CACHE_SIZE.
       * Uses lastAccessedAt to determine LRU order.
       */
      const evictLRUIfNeeded = (
        cache: Map<string, CacheEntry>
      ): Map<string, CacheEntry> => {
        if (cache.size <= MAX_CACHE_SIZE) {
          return cache;
        }

        // Sort by lastAccessedAt ascending (oldest first)
        const entries = Array.from(cache.entries()).sort(
          ([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt
        );

        // Keep only the most recent MAX_CACHE_SIZE entries
        const toKeep = entries.slice(-MAX_CACHE_SIZE);
        return new Map(toKeep);
      };

      const setCacheEntry = (
        databaseId: string,
        entry: CacheEntry
      ): Effect.Effect<void> =>
        Ref.update(schemaCacheRef, (cache) => {
          const next = new Map(cache);
          next.set(databaseId, entry);
          return evictLRUIfNeeded(next);
        });

      const updateCacheEntry = (
        databaseId: string,
        updater: (entry: CacheEntry) => CacheEntry
      ): Effect.Effect<void> =>
        Ref.update(schemaCacheRef, (cache) => {
          const current = cache.get(databaseId);
          if (!current) {
            return cache;
          }
          const next = new Map(cache);
          next.set(databaseId, updater(current));
          return next;
        });

      const invalidateCache = (
        databaseId: string
      ): Effect.Effect<void> =>
        Ref.update(schemaCacheRef, (cache) => {
          if (!cache.has(databaseId)) {
            return cache;
          }
          const next = new Map(cache);
          next.delete(databaseId);
          return next;
        });

      const invalidateCacheForDatabase = (
        databaseId: string
      ): Effect.Effect<void> =>
        invalidateCache(databaseId).pipe(
          Effect.tap(() =>
            Effect.logDebug(
              `schema cache invalidated for database ${databaseId}`
            )
          )
        );

      const getCacheEntry = (
        databaseId: string
      ): Effect.Effect<Option.Option<CacheEntry>> =>
        Ref.get(schemaCacheRef).pipe(
          Effect.map((cache) => Option.fromNullable(cache.get(databaseId)))
        );

      const markCacheHit = (
        databaseId: string,
        now: number
      ): Effect.Effect<void> =>
        updateCacheEntry(databaseId, (entry) => ({
          ...entry,
          hits: entry.hits + 1,
          lastAccessedAt: now,
        }));

      const markCacheStaleRead = (
        databaseId: string,
        now: number
      ): Effect.Effect<void> =>
        updateCacheEntry(databaseId, (entry) => ({
          ...entry,
          staleReads: entry.staleReads + 1,
          lastAccessedAt: now,
        }));

      const getDatabaseIdFromPage = (
        page: unknown
      ): Option.Option<string> => {
        if (
          page &&
          typeof page === "object" &&
          "parent" in page &&
          page.parent &&
          typeof page.parent === "object" &&
          "type" in page.parent &&
          (page.parent as { type?: unknown }).type === "database_id"
        ) {
          const dbId = (page.parent as { database_id?: unknown }).database_id;
          if (typeof dbId === "string" && dbId.length > 0) {
            return Option.some(dbId);
          }
        }
        return Option.none();
      };

      const getNormalizedSchema = (
        databaseId: string
      ): Effect.Effect<NormalizedDatabaseSchema, NotionError> =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const cacheEntry = yield* getCacheEntry(databaseId);
          const existing = Option.match(cacheEntry, {
            onNone: () => undefined,
            onSome: (entry) => entry,
          });
          if (existing && now - existing.fetchedAt < SCHEMA_TTL_MS) {
            yield* markCacheHit(databaseId, now);
            return existing.schema;
          }

          const db = yield* notionClient
            .retrieveDatabase(databaseId)
            .pipe(
              Effect.tapError((e) =>
                Effect.logWarning(
                  `retrieveDatabase failed for databaseId=${
                    databaseId
                  }; errorTag=${(e as NotionError)?._tag ?? "Unknown"}`
                )
              ),
              Effect.mapError(mapToNotionError)
            );

          const normalized: NormalizedDatabaseSchema = normalizeDatabase(db);

          if (
            existing &&
            (existing.schema.propertiesHash !== normalized.propertiesHash ||
              existing.schema.lastEditedTime !== normalized.lastEditedTime)
          ) {
            yield* Effect.logInfo(
              `Schema changed for database ${
                databaseId
              }; lastEditedTime=${normalized.lastEditedTime}`
            );
          }
          yield* setCacheEntry(databaseId, {
            schema: normalized,
            fetchedAt: now,
            lastAccessedAt: now,
            hits: 0,
            refreshes: (existing?.refreshes ?? 0) + 1,
            staleReads: existing?.staleReads ?? 0,
          });
          return normalized;
        });

      const getCachedSchema = (
        databaseId: string
      ): Effect.Effect<Option.Option<NormalizedDatabaseSchema>> =>
        getCacheEntry(databaseId).pipe(
          Effect.map((entry) => Option.map(entry, (value) => value.schema))
        );

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
          getNormalizedSchema(databaseId).pipe(
            Effect.tapError((err) =>
              Effect.logWarning(
                `getNormalizedSchema failed for databaseId=${
                  databaseId
                }; falling back to stale cache if available; errorTag=${
                  (err as NotionError)?._tag ?? "Unknown"
                }`
              )
            ),
            Effect.orElse(() =>
              Effect.gen(function* () {
                const now = yield* Clock.currentTimeMillis;
                const entry = yield* getCacheEntry(databaseId);
                return yield* Option.match(entry, {
                  onNone: () => getNormalizedSchema(databaseId),
                  onSome: (cacheHit) =>
                    markCacheStaleRead(databaseId, now).pipe(
                      Effect.as(cacheHit.schema)
                    ),
                });
              })
            ),
            Effect.flatMap((schema) =>
              notionClient
                .queryDatabase(databaseId, {
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
                  Effect.mapError(mapToNotionError),
                  Effect.map((response) => {
                    const dbOverrides = fieldOverrides.overrides.get(databaseId);
                    const titleOverride = dbOverrides?.["title"];
                    const titleKey: string | undefined =
                      titlePropertyName ??
                      titleOverride ??
                      schema.titlePropertyName ??
                      undefined;

                    const results = response.results.map((page) => ({
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
            .queryDatabase(databaseId, {
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
              Effect.mapError(mapToNotionError),
              Effect.map((response) => {
                const dbOverrides = fieldOverrides.overrides.get(databaseId);
                const titleOverride = dbOverrides?.["title"];
                const titleKey: string | undefined =
                  titlePropertyName ??
                  titleOverride ??
                  schema.titlePropertyName ??
                  undefined;

                const results = response.results.map((page) => ({
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
            .queryDatabase(databaseId, {
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
              Effect.mapError(mapToNotionError),
              Effect.map((response) => ({
                pages: response.results as ReadonlyArray<unknown>,
                hasMore: response.has_more,
                nextCursor: response.next_cursor,
              }))
            ),

        // Dynamic raw operations (no adapters, Notion-native shapes)
        dynamicQuery: (args: {
          databaseId: string;
          filter?: unknown;
          sorts?: unknown;
          pageSize?: number;
          startCursor?: string;
        }) =>
          notionClient
            .queryDatabase(args.databaseId, {
              ...(args.filter !== undefined ? { filter: args.filter } : {}),
              ...(args.sorts !== undefined ? { sorts: args.sorts } : {}),
              ...(args.startCursor !== undefined
                ? { start_cursor: args.startCursor }
                : {}),
              ...(args.pageSize !== undefined
                ? { page_size: args.pageSize }
                : {}),
            })
            .pipe(
              Effect.tapError((e) =>
                Effect.logWarning(
                  `dynamicQuery failed for databaseId=${
                    args.databaseId
                  }; errorTag=${(e as NotionError)?._tag ?? "Unknown"}`
                )
              ),
              Effect.mapError(mapToNotionError),
              Effect.map((resp) => ({
                pages: resp.results as ReadonlyArray<unknown>,
                hasMore: resp.has_more,
                nextCursor: resp.next_cursor,
              }))
            ),

        dynamicGetPage: (pageId: string) =>
          notionClient.retrievePage(pageId).pipe(
            Effect.tapError((e) =>
              Effect.logWarning(
                `dynamicGetPage failed pageId=${pageId}; errorTag=${
                  (e as NotionError)?._tag ?? "Unknown"
                }`
              )
            ),
            Effect.mapError(mapToNotionError)
          ),

        dynamicCreatePage: (args: {
          databaseId: string;
          properties: Record<string, unknown>;
        }) =>
          notionClient
            .createPage(args.databaseId, args.properties)
            .pipe(
              Effect.tapError((e) =>
                Effect.logWarning(
                  `dynamicCreatePage failed db=${args.databaseId}; errorTag=${
                    (e as NotionError)?._tag ?? "Unknown"
                  }`
                )
              ),
              Effect.mapError(mapToNotionError)
            ),

        dynamicUpdatePage: (args: {
          pageId: string;
          properties: Record<string, unknown>;
        }) =>
          notionClient
            .updatePage(args.pageId, {
              properties: args.properties,
            })
            .pipe(
              Effect.tapError((e) =>
                Effect.logWarning(
                  `dynamicUpdatePage failed pageId=${args.pageId}; errorTag=${
                    (e as NotionError)?._tag ?? "Unknown"
                  }`
                )
              ),
              Effect.mapError(mapToNotionError)
            ),

        // Testing/utility: create a database with a simple spec
        createDatabaseWithSchema: (args: {
          parentPageId: string;
          title: string;
          spec: Record<
            string,
            {
              type:
                | "title"
                | "rich_text"
                | "number"
                | "checkbox"
                | "date"
                | "url"
                | "email"
                | "files"
                | "people"
                | "relation"
                | "select"
                | "multi_select"
                | "status"
                | "formula";
              options?: ReadonlyArray<string>;
              formulaType?: "number" | "string" | "boolean" | "date";
            }
          >;
        }) =>
          Effect.gen(function* () {
            const properties = buildNotionPropertiesFromSimpleSpec(args.spec);
            const db = yield* notionClient.createDatabase(
              args.parentPageId,
              args.title,
              properties
            );
            const normalized = normalizeDatabase(db);
            yield* invalidateCacheForDatabase(normalized.databaseId);
            return normalized;
          }),

        getArticleMetadata: (pageId: string) =>
          notionClient.retrievePage(pageId).pipe(
            Effect.tapError((e) =>
              Effect.logWarning(
                `retrievePage failed for pageId=${pageId}; errorTag=${
                  (e as NotionError)?._tag ?? "Unknown"
                }`
              )
            ),
            Effect.mapError(mapToNotionError),
            Effect.map((page) => ({
              properties: page.properties as unknown,
            }))
          ),

        updateArticleProperties: (
          pageId: string,
          properties: Record<string, unknown>
        ) =>
          notionClient
            .updatePage(pageId, { properties })
            .pipe(
              Effect.tapError((e) =>
                Effect.logWarning(
                  `updatePage failed for pageId=${pageId}; errorTag=${
                    (e as NotionError)?._tag ?? "Unknown"
                  }`
                )
              ),
              Effect.tap((page) =>
                Option.match(getDatabaseIdFromPage(page), {
                  onNone: () => Effect.void,
                  onSome: (dbId) => invalidateCacheForDatabase(dbId),
                })
              ),
              Effect.mapError(mapToNotionError),
              Effect.map((page) => ({
                properties: page.properties as unknown,
              }))
            ),

        getArticleContent: (pageId: string) =>
          getAllPaginatedResults((cursor) =>
            notionClient
              .retrieveBlockChildren(pageId, cursor)
              .pipe(
                Effect.tapError((e) =>
                  Effect.logWarning(
                    `retrieveBlockChildren failed for pageId=${pageId}; cursor=${
                      cursor ?? "<none>"
                    }; errorTag=${(e as NotionError)?._tag ?? "Unknown"}`
                  )
                ),
                Effect.mapError(mapToNotionError)
              )
          ).pipe(Effect.map(notionBlocksToMarkdown)),

        updateArticleContent: (pageId: string, content: string) =>
          Effect.gen(function* () {
            const databaseIdOpt = yield* notionClient
              .retrievePage(pageId)
              .pipe(
                Effect.map(getDatabaseIdFromPage),
                Effect.tapError((e) =>
                  Effect.logWarning(
                    `resolve database id failed for pageId=${pageId}; ` +
                      `errorTag=${e._tag ?? "Unknown"}`
                  )
                ),
                Effect.catchAll(() => Effect.succeed(Option.none<string>()))
              );
            const existingBlocks = yield* getAllPaginatedResults((cursor) =>
              notionClient
                .retrieveBlockChildren(pageId, cursor)
                .pipe(
                  Effect.tapError((e: NotionError) =>
                    Effect.logWarning(
                      `retrieveBlockChildren failed during update for pageId=${pageId}; cursor=${
                        cursor ?? "<none>"
                      }; errorTag=${e._tag ?? "Unknown"}`
                    )
                  ),
                  Effect.mapError(mapToNotionError)
                )
            );
            const blockIds = (
              existingBlocks as ReadonlyArray<{ id: string }>
            ).map((b) => b.id);

            // Use bounded concurrency to respect Notion API rate limits
            yield* Effect.forEach(
              blockIds,
              (id) =>
                notionClient.deleteBlock(id).pipe(
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
                    Effect.retry(
                      Schedule.exponential("100 millis").pipe(
                        Schedule.compose(Schedule.recurs(2))
                      )
                    )
                  ),
              { concurrency: 1 }
            );
            yield* Option.match(databaseIdOpt, {
              onNone: () => Effect.void,
              onSome: (dbId) => invalidateCacheForDatabase(dbId),
            });
          }).pipe(Effect.asVoid),
      };
    }),
  }
) {}
