import { Effect, Option } from "effect";
import type * as S from "effect/Schema";
import * as NotionSchema from "../../NotionSchema.js";
import { AppConfig, AppConfigProviderLive } from "../../config.js";
import type { BaseEntity, ListParams } from "../../domain/logical/Common.js";
import { Sources } from "../../domain/registry/sources.js";
import type { NotionError } from "../NotionClient/errors.js";
import { NotionClient } from "../NotionClient/service.js";
import { NotionService } from "../NotionService/service.js";
import { mapUnknownToNotionError, tapWarn } from "./helpers.js";
import type { ArticlesRepositoryApi } from "./api.js";
import type { ListResult } from "./types.js";

export class ArticlesRepository extends Effect.Service<ArticlesRepository>()(
  "ArticlesRepository",
  {
    accessors: true,
    dependencies: [NotionClient.Default, AppConfigProviderLive, NotionService.Default],
    effect: Effect.gen(function* () {
      const notionClient = yield* NotionClient;
      const { notionApiKey } = yield* AppConfig;
      const notionService = yield* NotionService;

      const svc: ArticlesRepositoryApi = {
        list: (params: ListParams): Effect.Effect<ListResult, NotionError> =>
          Effect.gen(function* () {
            const { source } = params;
            const cfg = Sources.resolve("articles", source);
            const query = cfg.adapter.toNotionQuery({
              databaseId: cfg.databaseId,
              params,
            });
            yield* Effect.logDebug(
              `ArticlesRepository.list built query source=${source} db=${cfg.databaseId} filter=${JSON.stringify(
                query.filter ?? null
              )} sorts=${JSON.stringify(query.sorts)}`
            );

            // Get schema once (cached by NotionService) and use the pages variant
            const schema = yield* notionService.getDatabaseSchema(cfg.databaseId);
            const resp = yield* notionService.listPagesWithSchema(
              cfg.databaseId,
              schema,
              query.filter,
              query.sorts,
              query.page_size,
              query.start_cursor
            );

            type NotionPage = S.Schema.Type<typeof NotionSchema.PageSchema>;

            const results: ReadonlyArray<BaseEntity> = (
              resp.pages as ReadonlyArray<NotionPage>
            ).map((page) =>
              cfg.adapter.fromNotionPage({
                source,
                databaseId: cfg.databaseId,
                page,
              })
            );

            return {
              results,
              hasMore: resp.hasMore,
              nextCursor: Option.getOrUndefined(
                resp.nextCursor as Option.Option<string>
              ),
            };
          }).pipe(
            Effect.withSpan("ArticlesRepository.list", {
              attributes: {
                source: params.source,
                pageSize: params.pageSize,
                hasFilter: !!params.filter,
                hasSort: !!params.sort,
              },
            })
          ),

        get: (
          args: { source: string; pageId: string }
        ): Effect.Effect<BaseEntity, NotionError> =>
          notionClient
            .retrievePage(notionApiKey, args.pageId)
            .pipe(
              tapWarn(
                `ArticlesRepository.get failed source=${args.source} page=${args.pageId}`
              ),
              Effect.mapError(mapUnknownToNotionError),
              Effect.map((page) => {
                const cfg = Sources.resolve("articles", args.source);
                return cfg.adapter.fromNotionPage({
                  source: args.source,
                  databaseId: cfg.databaseId,
                  page,
                });
              }),
              Effect.withSpan("ArticlesRepository.get", {
                attributes: {
                  source: args.source,
                  pageId: args.pageId,
                },
              })
            ),

        create: (
          args: { source: string; data: Partial<BaseEntity> }
        ): Effect.Effect<BaseEntity, NotionError> =>
          Effect.gen(function* () {
            const cfg = Sources.resolve("articles", args.source);
            const properties = cfg.adapter.toNotionProperties({
              patch: args.data,
            });

            const page = yield* notionClient
              .createPage(notionApiKey, cfg.databaseId, properties)
              .pipe(
                tapWarn(
                  `ArticlesRepository.create failed source=${args.source} db=${cfg.databaseId}`
                ),
                Effect.mapError(mapUnknownToNotionError)
              );

            return cfg.adapter.fromNotionPage({
              source: args.source,
              databaseId: cfg.databaseId,
              page,
            });
          }).pipe(
            Effect.withSpan("ArticlesRepository.create", {
              attributes: {
                source: args.source,
              },
            })
          ),

        update: (
          args: { source: string; pageId: string; patch: Partial<BaseEntity> }
        ): Effect.Effect<BaseEntity, NotionError> =>
          Effect.gen(function* () {
            const cfg = Sources.resolve("articles", args.source);
            const properties = cfg.adapter.toNotionProperties({
              patch: args.patch,
            });

            const page = yield* notionClient
              .updatePage(notionApiKey, args.pageId, {
                properties,
              })
              .pipe(
                tapWarn(
                  `ArticlesRepository.update failed source=${args.source} page=${args.pageId}`
                ),
                Effect.mapError(mapUnknownToNotionError)
              );

            return cfg.adapter.fromNotionPage({
              source: args.source,
              databaseId: cfg.databaseId,
              page,
            });
          }).pipe(
            Effect.withSpan("ArticlesRepository.update", {
              attributes: {
                source: args.source,
                pageId: args.pageId,
              },
            })
          ),

        delete: (
          args: { source: string; pageId: string }
        ): Effect.Effect<void, NotionError> =>
          notionClient
            .updatePage(notionApiKey, args.pageId, { archived: true })
            .pipe(
              tapWarn(
                `ArticlesRepository.delete failed source=${args.source} page=${args.pageId}`
              ),
              Effect.mapError(mapUnknownToNotionError),
              Effect.asVoid,
              Effect.withSpan("ArticlesRepository.delete", {
                attributes: {
                  source: args.source,
                  pageId: args.pageId,
                },
              })
            ),
      };

      return svc;
    }),
  }
) {}
