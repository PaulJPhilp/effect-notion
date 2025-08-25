// src/router.ts
/**
 * Pure router (Effect-based HttpApp)
 *
 * This module defines the application routes purely in Effect using
 * `@effect/platform` primitives. It is the single source of truth for the
 * API surface (no adapter bypasses here).
 *
 * The platform adapter in `api/index.ts` materializes this `HttpApp` into a
 * Fetch-compatible handler `(Request) => Promise<Response)` for Vercel
 * Node v3, wiring the required Layers (logger, config, Notion services).
 * Tests and local servers can run this `app` directly in Effect-land.
 */
import { Effect } from "effect";
import type * as HttpApp from "@effect/platform/HttpApp";
import * as HttpRouter from "@effect/platform/HttpRouter";
import * as HttpServerRequest from "@effect/platform/HttpServerRequest";
import * as HttpServerResponse from "@effect/platform/HttpServerResponse";
import { NotionService } from "./NotionService.js";
import { AppConfig } from "./config.js";
import * as ApiSchema from "./schema.js";
import { validateListArticlesRequestAgainstSchema } from "./validation.js";

const apiRouter = HttpRouter.empty.pipe(
  // --- Endpoints ---
  HttpRouter.post(
    "/api/list-articles",
    Effect.gen(function* () {
      yield* Effect.logInfo("/api/list-articles: start");
      const body: ApiSchema.ListArticlesRequest = yield* HttpServerRequest
        .schemaBodyJson(ApiSchema.ListArticlesRequestSchema, { onExcessProperty: "error" });
      yield* Effect.logInfo(
        `list-articles: db=${body.databaseId}, titleProp=${String(body.titlePropertyName)}, pageSize=${String(body.pageSize)}, startCursor=${String(body.startCursor)}`,
      );

      const notionService = yield* NotionService;

      // Schema-aware validation (titlePropertyName, filters, sorts)
      const schema = yield* notionService.getDatabaseSchema(body.databaseId);
      const errors = validateListArticlesRequestAgainstSchema(body, schema);
      if (errors.length > 0) {
        yield* Effect.logWarning(
          `list-articles: validation errors=${JSON.stringify(errors)}`,
        );
        return yield* HttpServerResponse.json({ errors }, { status: 400 });
      }

      const result = yield* notionService.listArticles(
        body.databaseId,
        body.titlePropertyName,
        body.filter,
        body.sorts,
        body.pageSize,
        body.startCursor,
      );
      yield* Effect.logInfo(
        `list-articles: success count=${result.results.length}, hasMore=${result.hasMore}, nextCursor=${String(result.nextCursor)}`,
      );

      return yield* HttpServerResponse.schemaJson(
        ApiSchema.ListArticlesResponseSchema,
      )(result);
    }),
  ),
  // New: expose normalized database schema for clients
  HttpRouter.get(
    "/api/get-database-schema",
    Effect.gen(function* () {
      yield* Effect.logInfo("/api/get-database-schema: start");
      const query = yield* HttpServerRequest.schemaSearchParams(
        ApiSchema.GetDatabaseSchemaRequestSchema,
      );
      yield* Effect.logInfo(
        `/api/get-database-schema: databaseId=${query.databaseId}`,
      );
      const notionService = yield* NotionService;
      const schema = yield* notionService.getDatabaseSchema(query.databaseId);
      return yield* HttpServerResponse.schemaJson(
        ApiSchema.NormalizedDatabaseSchemaSchema,
      )(schema);
    }),
  ),
  // New: get article metadata (properties)
  HttpRouter.get(
    "/api/get-article-metadata",
    Effect.gen(function* () {
      yield* Effect.logInfo("/api/get-article-metadata: start");
      const query = yield* HttpServerRequest.schemaSearchParams(
        ApiSchema.GetArticleMetadataRequestSchema,
      );
      yield* Effect.logInfo(
        `/api/get-article-metadata: pageId=${query.pageId}`,
      );
      const notionService = yield* NotionService;
      const meta = yield* notionService.getArticleMetadata(query.pageId);
      return yield* HttpServerResponse.schemaJson(
        ApiSchema.GetArticleMetadataResponseSchema,
      )(meta);
    }),
  ),
  // New: router-based health check (no adapter bypass)
  HttpRouter.get(
    "/api/health",
    Effect.gen(function* () {
      const cfg = yield* AppConfig;
      const hasApiKey = Boolean(cfg.notionApiKey && cfg.notionApiKey.length > 0);
      let notionOk: boolean | undefined = undefined;
      let error: string | undefined = undefined;
      if (cfg.notionDatabaseId) {
        const notionService = yield* NotionService;
        const attempt = yield* Effect.either(
          notionService.getDatabaseSchema(cfg.notionDatabaseId),
        );
        if (attempt._tag === "Right") notionOk = true;
        else {
          notionOk = false;
          error = String(attempt.left);
        }
      }
      const ok = hasApiKey && (notionOk !== false);
      const body = {
        ok,
        env: cfg.env,
        hasApiKey,
        checkedDatabaseId: cfg.notionDatabaseId || null,
        notionOk,
        error: error ?? null,
      } as const;
      return yield* HttpServerResponse.raw(
        new Response(JSON.stringify(body) + "\n", {
          status: ok ? 200 : 503,
          headers: { "content-type": "application/json; charset=utf-8" },
        }),
      );
    }),
  ),
  HttpRouter.get(
    "/api/get-article-content",
    Effect.gen(function* () {
      yield* Effect.logInfo("/api/get-article-content: start");
      const query = yield* HttpServerRequest.schemaSearchParams(
        ApiSchema.GetArticleContentRequestSchema,
      );
      yield* Effect.logInfo(
        `/api/get-article-content: pageId=${query.pageId}`,
      );
      const notionService = yield* NotionService;
      const content = yield* notionService.getArticleContent(query.pageId);
      yield* Effect.logInfo(
        `/api/get-article-content: contentLength=${content.length}`,
      );

      return yield* HttpServerResponse.schemaJson(
        ApiSchema.GetArticleContentResponseSchema,
      )({ content });
    }),
  ),
  HttpRouter.post(
    "/api/update-article-content",
    Effect.gen(function* () {
      yield* Effect.logInfo("/api/update-article-content: start");
      const body: ApiSchema.UpdateArticleContentRequest =
        yield* HttpServerRequest.schemaBodyJson(
          ApiSchema.UpdateArticleContentRequestSchema,
        );
      yield* Effect.logInfo(
        `/api/update-article-content: pageId=${body.pageId}, contentLength=${body.content.length}`,
      );

      const notionService = yield* NotionService;
      yield* notionService.updateArticleContent(
        body.pageId,
        body.content,
      );
      yield* Effect.logInfo("/api/update-article-content: success");

      // On success, return a 204 No Content response
      return HttpServerResponse.empty({ status: 204 });
    }),
  ),
  
);

// --- Full App with Error Handling ---
const routerWithErrors = apiRouter.pipe(
  HttpRouter.catchTags({
    InvalidApiKeyError: () =>
      Effect.gen(function* () {
        yield* Effect.logWarning("catchTags: InvalidApiKeyError");
        return yield* HttpServerResponse.text(
          JSON.stringify({ error: "Invalid API Key" }),
          { status: 401 },
        );
      }),
    NotFoundError: () =>
      Effect.gen(function* () {
        yield* Effect.logWarning("catchTags: NotFoundError");
        return yield* HttpServerResponse.text(
          JSON.stringify({ error: "Resource not found" }),
          { status: 404 },
        );
      }),
    InternalServerError: () =>
      Effect.gen(function* () {
        yield* Effect.logError("catchTags: InternalServerError");
        return yield* HttpServerResponse.text(
          JSON.stringify({ error: "Internal Server Error" }),
          { status: 500 },
        );
      }),
    // Ensure unmatched routes produce a 404 response
    RouteNotFound: () =>
      Effect.gen(function* () {
        yield* Effect.logWarning("catchTags: RouteNotFound");
        return yield* HttpServerResponse.text(
          JSON.stringify({ error: "Not Found" }),
          { status: 404 },
        );
      }),
  }),
  // Final safety net to ensure no errors escape the router
  HttpRouter.catchAll((e) =>
    Effect.gen(function* () {
      const detail = (e instanceof Error) ? e.message : String(e);
      yield* Effect.logError(`catchAll: ${detail}`);
      return yield* HttpServerResponse.text(
        JSON.stringify({ error: "Unhandled error", detail }),
        { status: 500 },
      );
    }),
  ),
);

// Convert to HttpApp and assert branding so the adapter accepts it
export const app = HttpRouter.toHttpApp(routerWithErrors) as unknown as HttpApp.Default<NotionService, never>;