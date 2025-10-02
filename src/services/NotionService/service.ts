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
import { InternalServerError } from "../NotionClient/errors.js";
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
      const { notionApiKey } = yield* AppConfig;
      const fieldOverrides = yield* LogicalFieldOverridesService;

      type CacheEntry = { schema: NormalizedDatabaseSchema; fetchedAt: number };
      const schemaCacheRef = yield* Ref.make(new Map<string, CacheEntry>());
      const SCHEMA_TTL_MS = 10 * 60 * 1000; // 10 minutes

      const getNormalizedSchema = (
        databaseId: string
      ): Effect.Effect<NormalizedDatabaseSchema, NotionError> =>
        Effect.gen(function* () {
          const now = yield* Clock.currentTimeMillis;
          const cache: Map<string, CacheEntry> = yield* Ref.get(schemaCacheRef);
          const existing: CacheEntry | undefined = cache.get(databaseId);
          if (existing && now - existing.fetchedAt < SCHEMA_TTL_MS) {
            return existing.schema;
          }

          const db = yield* notionClient
            .retrieveDatabase(notionApiKey, databaseId)
            .pipe(
              Effect.tapError((e) =>
                Effect.logWarning(
                  `retrieveDatabase failed for databaseId=${
                    databaseId
                  }; errorTag=${(e as NotionError)?._tag ?? "Unknown"}`
                )
              ),
              Effect.catchAll((e) =>
                Effect.fail(
                  typeof (e as { _tag?: unknown })._tag === "string"
                    ? (e as NotionError)
                    : new InternalServerError({ cause: e })
                )
              )
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
                `getNormalizedSchema failed for databaseId=${
                  databaseId
                }; falling back to stale cache if available; errorTag=${
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
              Effect.catchAll((e) =>
                Effect.fail(
                  typeof (e as { _tag?: unknown })._tag === "string"
                    ? (e as NotionError)
                    : new InternalServerError({ cause: e })
                )
              ),
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
              Effect.catchAll((e) =>
                Effect.fail(
                  typeof (e as { _tag?: unknown })._tag === "string"
                    ? (e as NotionError)
                    : new InternalServerError({ cause: e })
                )
              ),
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
            .queryDatabase(notionApiKey, args.databaseId, {
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
              Effect.catchAll((e) =>
                Effect.fail(
                  typeof (e as { _tag?: unknown })._tag === "string"
                    ? (e as NotionError)
                    : new InternalServerError({ cause: e })
                )
              ),
              Effect.map((resp) => ({
                pages: resp.results as ReadonlyArray<unknown>,
                hasMore: resp.has_more,
                nextCursor: resp.next_cursor,
              }))
            ),

        dynamicGetPage: (pageId: string) =>
          notionClient.retrievePage(notionApiKey, pageId).pipe(
            Effect.tapError((e) =>
              Effect.logWarning(
                `dynamicGetPage failed pageId=${pageId}; errorTag=${
                  (e as NotionError)?._tag ?? "Unknown"
                }`
              )
            ),
            Effect.mapError((e) =>
              typeof (e as { _tag?: unknown })._tag === "string"
                ? (e as NotionError)
                : new InternalServerError({ cause: e })
            )
          ),

        dynamicCreatePage: (args: {
          databaseId: string;
          properties: Record<string, unknown>;
        }) =>
          notionClient
            .createPage(notionApiKey, args.databaseId, args.properties)
            .pipe(
              Effect.tapError((e) =>
                Effect.logWarning(
                  `dynamicCreatePage failed db=${args.databaseId}; errorTag=${
                    (e as NotionError)?._tag ?? "Unknown"
                  }`
                )
              ),
              Effect.catchAll((e) =>
                Effect.fail(
                  typeof (e as { _tag?: unknown })._tag === "string"
                    ? (e as NotionError)
                    : new InternalServerError({ cause: e })
                )
              )
            ),

        dynamicUpdatePage: (args: {
          pageId: string;
          properties: Record<string, unknown>;
        }) =>
          notionClient
            .updatePage(notionApiKey, args.pageId, {
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
              Effect.catchAll((e) =>
                Effect.fail(
                  typeof (e as { _tag?: unknown })._tag === "string"
                    ? (e as NotionError)
                    : new InternalServerError({ cause: e })
                )
              )
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
              notionApiKey,
              args.parentPageId,
              args.title,
              properties
            );
            return normalizeDatabase(db);
          }),

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
            Effect.map((page) => ({
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
