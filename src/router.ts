// src/router.ts
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
      const body: ApiSchema.ListArticlesRequest = yield* HttpServerRequest
        .schemaBodyJson(ApiSchema.ListArticlesRequestSchema, { onExcessProperty: "error" });

      const notionService = yield* NotionService;

      // Schema-aware validation (titlePropertyName, filters, sorts)
      const schema = yield* notionService.getDatabaseSchema(body.databaseId);
      const errors = validateListArticlesRequestAgainstSchema(body, schema);
      if (errors.length > 0) {
        return yield* HttpServerResponse.json({ errors }, { status: 400 });
      }

      const articles = yield* notionService.listArticles(
        body.databaseId,
        body.titlePropertyName,
        body.filter,
        body.sorts,
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
      const query = yield* HttpServerRequest.schemaSearchParams(
        ApiSchema.GetArticleContentRequestSchema,
      );
      const notionService = yield* NotionService;
      const content = yield* notionService.getArticleContent(query.pageId);

      return yield* HttpServerResponse.schemaJson(
        ApiSchema.GetArticleContentResponseSchema,
      )({ content });
    }),
  ),
  HttpRouter.post(
    "/api/update-article-content",
    Effect.gen(function* () {
      const body: ApiSchema.UpdateArticleContentRequest =
        yield* HttpServerRequest.schemaBodyJson(
          ApiSchema.UpdateArticleContentRequestSchema,
        );

      const notionService = yield* NotionService;
      yield* notionService.updateArticleContent(
        body.pageId,
        body.content,
      );

      // On success, return a 204 No Content response
      return HttpServerResponse.empty({ status: 204 });
    }),
  ),
  // Health check endpoint (JSON 200)
  HttpRouter.get(
    "/api/health",
    HttpServerResponse.json({ ok: true }, { status: 200 }),
  ),
  // Simple ping route (clear 200 with payload)
  HttpRouter.get(
    "/api/ping",
    HttpServerResponse.json({ ok: true, ts: Date.now() }),
  ),
);

// --- Full App with Error Handling ---
const routerWithErrors = apiRouter.pipe(
  HttpRouter.catchTags({
    InvalidApiKeyError: () =>
      HttpServerResponse.text(
        JSON.stringify({ error: "Invalid API Key" }),
        { status: 401 },
      ),
    NotFoundError: () =>
      HttpServerResponse.text(
        JSON.stringify({ error: "Resource not found" }),
        { status: 404 },
      ),
    InternalServerError: () =>
      HttpServerResponse.text(
        JSON.stringify({ error: "Internal Server Error" }),
        { status: 500 },
      ),
    // Ensure unmatched routes produce a 404 response
    RouteNotFound: () =>
      HttpServerResponse.text(
        JSON.stringify({ error: "Not Found" }),
        { status: 404 },
      ),
  }),
  // Final safety net to ensure no errors escape the router
  HttpRouter.catchAll((e) =>
    HttpServerResponse.text(
      JSON.stringify({
        error: "Unhandled error",
        detail: (e instanceof Error) ? e.message : String(e),
      }),
      { status: 500 },
    ),
  ),
);

// Convert to HttpApp and assert branding so the adapter accepts it
export const app = HttpRouter.toHttpApp(routerWithErrors) as unknown as HttpApp.Default<NotionService, never>;