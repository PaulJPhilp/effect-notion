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
        `list-articles: db=${body.databaseId}, titleProp=${String(body.titlePropertyName)}`,
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

      const articles = yield* notionService.listArticles(
        body.databaseId,
        body.titlePropertyName,
        body.filter,
        body.sorts,
      );
      yield* Effect.logInfo(
        `list-articles: success count=${articles.length}`,
      );

      return yield* HttpServerResponse.schemaJson(
        ApiSchema.ListArticlesResponseSchema,
      )(
        articles,
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