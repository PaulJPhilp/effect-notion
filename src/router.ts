import * as HttpRouter from "@effect/platform/HttpRouter";
import * as HttpServerRequest from "@effect/platform/HttpServerRequest";
import * as HttpServerResponse from "@effect/platform/HttpServerResponse";
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
import type { NormalizedDatabaseSchema } from "./NotionSchema.js";
import { AppConfig } from "./config.js";
import { formatParseError } from "./domain/adapters/schema/Errors.js";
import {
  type SourceNotFoundError,
  Sources,
} from "./domain/registry/sources.js";
import { badRequest, internalError, notFound, unauthorized } from "./errors.js";
import {
  addRequestIdToHeaders,
  getRequestId,
  setCurrentRequestId,
} from "./http/requestId.js";
import applyArticlesRoutes from "./router/articles.js";
import * as ApiSchema from "./schema.js";
import {
  DbCreateDatabaseRequestSchema,
  DbCreateDatabaseResponseSchema,
  DbCreatePageRequestSchema,
  DbCreatePageResponseSchema,
  DbGetPageRequestSchema,
  DbGetPageResponseSchema,
  DbGetSchemaRequestSchema,
  DbGetSchemaResponseSchema,
  DbQueryRequestSchema,
  DbQueryResponseSchema,
  DbUpdatePageRequestSchema,
  DbUpdatePageResponseSchema,
} from "./schema.js";
import { NotionService } from "./services/NotionService/service.js";
import { validateListArticlesRequestAgainstSchema } from "./validation.js";

let apiRouter = HttpRouter.empty.pipe(
  // --- Endpoints ---
  HttpRouter.post(
    "/api/list-articles",
    Effect.gen(function* () {
      // Extract request ID and store in FiberRef for logging context
      const req = yield* HttpServerRequest.HttpServerRequest;
      const requestId = getRequestId(req.headers);
      yield* setCurrentRequestId(requestId);

      yield* Effect.logInfo("/api/list-articles: start");
      const body: ApiSchema.ListArticlesRequest =
        yield* HttpServerRequest.schemaBodyJson(
          ApiSchema.ListArticlesRequestSchema,
          { onExcessProperty: "error" },
        );
      yield* Effect.logInfo(
        `list-articles: db=${body.databaseId}, titleProp=${String(
          body.titlePropertyName,
        )}, pageSize=${String(body.pageSize)}, startCursor=${String(
          body.startCursor,
        )}`,
      );

      const notionService = yield* NotionService;

      // Schema-aware validation (titlePropertyName, filters, sorts)
      const schema = yield* notionService.getDatabaseSchema(body.databaseId);
      const errors = validateListArticlesRequestAgainstSchema(body, schema);
      if (errors.length > 0) {
        yield* Effect.logWarning(
          `list-articles: validation errors=${JSON.stringify(errors)}`,
        );
        return yield* badRequest({ errors });
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
        `list-articles: success count=${result.results.length}, hasMore=${
          result.hasMore
        }, nextCursor=${String(result.nextCursor)}`,
      );

      // Add request ID to response headers
      return yield* HttpServerResponse.schemaJson(
        ApiSchema.ListArticlesResponseSchema,
      )(result).pipe(
        Effect.map((response) =>
          HttpServerResponse.setHeaders(
            addRequestIdToHeaders(response.headers, requestId),
          )(response),
        ),
      );
    }),
  ),
  // New: expose normalized database schema for clients
  HttpRouter.get(
    "/api/get-database-schema",
    Effect.gen(function* () {
      // Extract request ID and store in FiberRef for logging context
      const req = yield* HttpServerRequest.HttpServerRequest;
      const requestId = getRequestId(req.headers);
      yield* setCurrentRequestId(requestId);

      yield* Effect.logInfo("/api/get-database-schema: start");
      const query = yield* HttpServerRequest.schemaSearchParams(
        ApiSchema.GetDatabaseSchemaRequestSchema,
      );
      yield* Effect.logInfo(
        `/api/get-database-schema: databaseId=${query.databaseId}`,
      );
      const notionService = yield* NotionService;
      const schema = yield* notionService.getDatabaseSchema(query.databaseId);
      // Provide backward-compatible alias `titleProperty` expected by tests
      const out = {
        ...schema,
        titleProperty: schema.titlePropertyName,
      } as const;

      // Add request ID to response headers
      return yield* HttpServerResponse.schemaJson(
        ApiSchema.NormalizedDatabaseSchemaSchema,
      )(out).pipe(
        Effect.map((response) =>
          HttpServerResponse.setHeaders(
            addRequestIdToHeaders(response.headers, requestId),
          )(response),
        ),
      );
    }),
  ),
  // New: get article metadata (properties)
  HttpRouter.get(
    "/api/get-article-metadata",
    Effect.gen(function* () {
      // Extract request ID and store in FiberRef for logging context
      const req = yield* HttpServerRequest.HttpServerRequest;
      const requestId = getRequestId(req.headers);
      yield* setCurrentRequestId(requestId);

      yield* Effect.logInfo("/api/get-article-metadata: start");
      const query = yield* HttpServerRequest.schemaSearchParams(
        ApiSchema.GetArticleMetadataRequestSchema,
      );
      yield* Effect.logInfo(
        `/api/get-article-metadata: pageId=${query.pageId}`,
      );
      const notionService = yield* NotionService;
      const meta = yield* notionService.getArticleMetadata(query.pageId);
      // Include id in response payload to match API schema
      const out = { id: query.pageId, ...meta } as const;

      // Add request ID to response headers
      return yield* HttpServerResponse.schemaJson(
        ApiSchema.GetArticleMetadataResponseSchema,
      )(out).pipe(
        Effect.map((response) =>
          HttpServerResponse.setHeaders(
            addRequestIdToHeaders(response.headers, requestId),
          )(response),
        ),
      );
    }),
  ),
  // New: router-based health check (no adapter bypass)
  HttpRouter.get(
    "/api/health",
    Effect.gen(function* () {
      // Extract request ID and store in FiberRef for logging context
      const req = yield* HttpServerRequest.HttpServerRequest;
      const requestId = getRequestId(req.headers);
      yield* setCurrentRequestId(requestId);

      const cfg = yield* AppConfig;
      const hasApiKey = Boolean(
        cfg.notionApiKey && cfg.notionApiKey.length > 0,
      );
      const shouldCheckNotion = cfg.env !== "development" && hasApiKey;

      let notionOk: boolean | undefined = undefined;
      let error: string | null = null;
      let checkedDatabaseId: string | null = null;

      if (shouldCheckNotion) {
        const candidate = Sources.all()[0];
        if (candidate) {
          checkedDatabaseId = candidate.databaseId;
          const notionService = yield* NotionService;
          const result = yield* notionService
            .getDatabaseSchema(candidate.databaseId)
            .pipe(Effect.either);
          if (result._tag === "Left") {
            notionOk = false;
            error = String(result.left);
            yield* Effect.logWarning(
              `health: notion check failed for db=${candidate.databaseId}`,
            );
          } else {
            notionOk = true;
            yield* Effect.logDebug(
              `health: notion check ok for db=${candidate.databaseId}`,
            );
          }
        } else {
          yield* Effect.logWarning(
            "health: no configured Notion source to validate",
          );
        }
      }

      const ok = hasApiKey && (!shouldCheckNotion || notionOk === true);
      const body = {
        ok,
        env: cfg.env,
        hasApiKey,
        checkedDatabaseId,
        notionOk,
        error,
      } as const;

      // Add request ID to response headers
      return yield* HttpServerResponse.json(body, {
        status: ok ? 200 : 503,
        headers: addRequestIdToHeaders({}, requestId),
      });
    }),
  ),
  HttpRouter.get(
    "/api/get-article-content",
    Effect.gen(function* () {
      // Extract request ID and store in FiberRef for logging context
      const req = yield* HttpServerRequest.HttpServerRequest;
      const requestId = getRequestId(req.headers);
      yield* setCurrentRequestId(requestId);

      yield* Effect.logInfo("/api/get-article-content: start");
      const query: ApiSchema.GetArticleContentRequest =
        yield* HttpServerRequest.schemaSearchParams(
          ApiSchema.GetArticleContentRequestSchema,
        );
      yield* Effect.logInfo(`/api/get-article-content: pageId=${query.pageId}`);
      const notionService = yield* NotionService;
      const content: string = yield* notionService.getArticleContent(
        query.pageId,
      );
      yield* Effect.logInfo(
        `/api/get-article-content: contentLength=${content.length}`,
      );

      // Add request ID to response headers
      return yield* HttpServerResponse.schemaJson(
        ApiSchema.GetArticleContentResponseSchema,
      )({ content }).pipe(
        Effect.map((response) =>
          HttpServerResponse.setHeaders(
            addRequestIdToHeaders(response.headers, requestId),
          )(response),
        ),
      );
    }),
  ),
  // -----------------------------------
  // Dynamic DB endpoints (Notion-native)
  // -----------------------------------
  HttpRouter.post(
    "/api/db/query",
    Effect.gen(function* () {
      const req = yield* HttpServerRequest.HttpServerRequest;
      const requestId = getRequestId(req.headers);
      yield* setCurrentRequestId(requestId);

      const body =
        yield* HttpServerRequest.schemaBodyJson(DbQueryRequestSchema);
      const notionService = yield* NotionService;
      const out = yield* notionService.dynamicQuery({
        databaseId: body.databaseId,
        ...(body.filter !== undefined ? { filter: body.filter } : {}),
        ...(body.sorts !== undefined ? { sorts: body.sorts } : {}),
        ...(body.pageSize !== undefined ? { pageSize: body.pageSize } : {}),
        ...(body.startCursor !== undefined
          ? { startCursor: body.startCursor }
          : {}),
      });

      return yield* HttpServerResponse.schemaJson(DbQueryResponseSchema)(
        out,
      ).pipe(
        Effect.map((response) =>
          HttpServerResponse.setHeaders(
            addRequestIdToHeaders(response.headers, requestId),
          )(response),
        ),
      );
    }),
  ),
  HttpRouter.get(
    "/api/db/get",
    Effect.gen(function* () {
      const req = yield* HttpServerRequest.HttpServerRequest;
      const requestId = getRequestId(req.headers);
      yield* setCurrentRequestId(requestId);

      const query = yield* HttpServerRequest.schemaSearchParams(
        DbGetPageRequestSchema,
      );
      const notionService = yield* NotionService;
      const page = yield* notionService.dynamicGetPage(query.pageId);
      return yield* HttpServerResponse.schemaJson(DbGetPageResponseSchema)(
        page,
      ).pipe(
        Effect.map((response) =>
          HttpServerResponse.setHeaders(
            addRequestIdToHeaders(response.headers, requestId),
          )(response),
        ),
      );
    }),
  ),
  HttpRouter.post(
    "/api/db/create",
    Effect.gen(function* () {
      const req = yield* HttpServerRequest.HttpServerRequest;
      const requestId = getRequestId(req.headers);
      yield* setCurrentRequestId(requestId);

      const body = yield* HttpServerRequest.schemaBodyJson(
        DbCreatePageRequestSchema,
      );
      const notionService = yield* NotionService;
      const page = yield* notionService.dynamicCreatePage({
        databaseId: body.databaseId,
        properties: body.properties,
      });
      return yield* HttpServerResponse.schemaJson(DbCreatePageResponseSchema)(
        page,
      ).pipe(
        Effect.map((response) =>
          HttpServerResponse.setHeaders(
            addRequestIdToHeaders(response.headers, requestId),
          )(response),
        ),
      );
    }),
  ),
  HttpRouter.post(
    "/api/db/update",
    Effect.gen(function* () {
      const req = yield* HttpServerRequest.HttpServerRequest;
      const requestId = getRequestId(req.headers);
      yield* setCurrentRequestId(requestId);

      const body = yield* HttpServerRequest.schemaBodyJson(
        DbUpdatePageRequestSchema,
      );
      const notionService = yield* NotionService;
      const page = yield* notionService.dynamicUpdatePage({
        pageId: body.pageId,
        properties: body.properties,
      });
      return yield* HttpServerResponse.schemaJson(DbUpdatePageResponseSchema)(
        page,
      ).pipe(
        Effect.map((response) =>
          HttpServerResponse.setHeaders(
            addRequestIdToHeaders(response.headers, requestId),
          )(response),
        ),
      );
    }),
  ),
  HttpRouter.post(
    "/api/update-article-content",
    Effect.gen(function* () {
      // Extract request ID and store in FiberRef for logging context
      const req = yield* HttpServerRequest.HttpServerRequest;
      const requestId = getRequestId(req.headers);
      yield* setCurrentRequestId(requestId);

      yield* Effect.logInfo("/api/update-article-content: start");
      const body: ApiSchema.UpdateArticleContentRequest =
        yield* HttpServerRequest.schemaBodyJson(
          ApiSchema.UpdateArticleContentRequestSchema,
        );
      yield* Effect.logInfo(
        `/api/update-article-content: pageId=${
          body.pageId
        }, contentLength=${body.content.length}`,
      );

      const notionService = yield* NotionService;
      yield* notionService.updateArticleContent(body.pageId, body.content);
      yield* Effect.logInfo("/api/update-article-content: success");

      // On success, return a 204 No Content response with request ID header
      return yield* HttpServerResponse.empty({
        status: 204,
        headers: addRequestIdToHeaders({}, requestId),
      });
    }),
  ),
  HttpRouter.post(
    "/api/db/create-database",
    Effect.gen(function* () {
      const req = yield* HttpServerRequest.HttpServerRequest;
      const requestId = getRequestId(req.headers);
      yield* setCurrentRequestId(requestId);

      yield* Effect.logInfo("/api/db/create-database: start");
      const body = yield* HttpServerRequest.schemaBodyJson(
        DbCreateDatabaseRequestSchema,
        {
          onExcessProperty: "error",
        },
      );
      yield* Effect.logInfo(
        `/api/db/create-database: parentPageId=${
          body.parentPageId
        }, title=${body.title}`,
      );

      const notionService = yield* NotionService;
      const result: NormalizedDatabaseSchema =
        yield* notionService.createDatabaseWithSchema({
          parentPageId: body.parentPageId,
          title: body.title,
          spec: body.spec as Record<
            string,
            {
              type:
                | "number"
                | "title"
                | "rich_text"
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
              options?: readonly string[];
              formulaType?: "string" | "number" | "boolean" | "date";
            }
          >,
        });

      return yield* HttpServerResponse.schemaJson(
        DbCreateDatabaseResponseSchema,
      )({
        databaseId: result.databaseId,
        properties: result.properties,
      }).pipe(
        Effect.map((response) =>
          HttpServerResponse.setHeaders(
            addRequestIdToHeaders(response.headers, requestId),
          )(response),
        ),
      );
    }),
  ),
  HttpRouter.get(
    "/api/db/get-schema",
    Effect.gen(function* () {
      const req = yield* HttpServerRequest.HttpServerRequest;
      const requestId = getRequestId(req.headers);
      yield* setCurrentRequestId(requestId);

      yield* Effect.logInfo("/api/db/get-schema: start");
      const query = yield* HttpServerRequest.schemaSearchParams(
        DbGetSchemaRequestSchema,
      );
      yield* Effect.logInfo(
        `/api/db/get-schema: databaseId=${query.databaseId}`,
      );

      const notionService = yield* NotionService;
      const schema = yield* notionService.getDatabaseSchema(query.databaseId);

      return yield* HttpServerResponse.schemaJson(DbGetSchemaResponseSchema)({
        schema: schema,
        properties: schema.properties,
      }).pipe(
        Effect.map((response) =>
          HttpServerResponse.setHeaders(
            addRequestIdToHeaders(response.headers, requestId),
          )(response),
        ),
      );
    }),
  ),
  // Fallback: ensure unmatched routes do not raise RouteNotFound
  HttpRouter.all(
    "/*",
    Effect.gen(function* () {
      return yield* notFound();
    }),
  ),
);

// Compose feature routers
apiRouter = applyArticlesRoutes(apiRouter);

// Add metrics routes
import { applySimpleMetricsRoutes } from "./router/simpleMetrics.js";
apiRouter = applySimpleMetricsRoutes(apiRouter);

// --- Full App with Error Handling ---
const routerWithErrors = apiRouter.pipe(
  HttpRouter.catchTags({
    // Bad requests / schema parse
    RequestError: (e: unknown) =>
      Effect.gen(function* () {
        yield* Effect.logWarning(`catchTags: RequestError ${String(e)}`);
        return yield* badRequest({ detail: e });
      }),
    ParseError: (e: unknown) =>
      Effect.gen(function* () {
        const pretty = formatParseError(e);
        yield* Effect.logWarning(`catchTags: ParseError ${pretty}`);
        return yield* badRequest({ detail: pretty });
      }),
    BadRequestError: (e: unknown) =>
      Effect.gen(function* () {
        yield* Effect.logWarning(`catchTags: BadRequestError ${String(e)}`);
        return yield* badRequest({ detail: e });
      }),
    InvalidApiKeyError: () =>
      Effect.gen(function* () {
        yield* Effect.logWarning("catchTags: InvalidApiKeyError");
        return yield* unauthorized();
      }),
    NotFoundError: () =>
      Effect.gen(function* () {
        yield* Effect.logWarning("catchTags: NotFoundError");
        return yield* notFound();
      }),
    SourceNotFoundError: (e: SourceNotFoundError) =>
      Effect.gen(function* () {
        yield* Effect.logWarning(
          `catchTags: SourceNotFoundError kind=${e.kind} alias=${e.alias}`,
        );
        return yield* notFound({
          detail: `Source not found: ${e.kind}/${e.alias}`,
        });
      }),
    InternalServerError: (e: unknown) =>
      Effect.gen(function* () {
        yield* Effect.logError("catchTags: InternalServerError");
        return yield* internalError(e);
      }),
    HttpBodyError: (e: unknown) =>
      Effect.gen(function* () {
        yield* Effect.logError(`catchTags: HttpBodyError ${String(e)}`);
        return yield* internalError(e);
      }),
    // Ensure unmatched routes produce a 404 response
    RouteNotFound: () =>
      Effect.gen(function* () {
        yield* Effect.logWarning("catchTags: RouteNotFound");
        return yield* notFound();
      }),
  }),
  // Final safety net to ensure no errors escape the router
  HttpRouter.catchAll((e) =>
    Effect.gen(function* () {
      const req = yield* HttpServerRequest.HttpServerRequest;
      const detail = e instanceof Error ? e.message : String(e);
      yield* Effect.logError(`catchAll: ${req.method} ${req.url} ${detail}`);
      return yield* internalError(detail);
    }),
  ),
);

// Expose the router as the default HttpApp
export const app = routerWithErrors;
