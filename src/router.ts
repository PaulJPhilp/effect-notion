// src/router.ts
import { Effect } from "effect";
import { Http } from "@effect/platform";
import { NotionService } from "./NotionService";
import { NotionError } from "./NotionClient";
import * as Schema from "./schema";

// Create a new router
const router = Http.router.empty.pipe(
  // 1. Endpoint to list articles
  Http.router.post(
    "/api/list-articles",
    Effect.gen(function* () {
      const request = yield* Http.request.ServerRequest;
      const body = yield* request.schemaBodyJson(
        Schema.ListArticlesRequestSchema,
      );

      const notionService = yield* NotionService;
      const articles = yield* notionService.listArticles(
        body.apiKey,
        body.databaseId,
      );

      return yield* Http.response.schemaJson(Schema.ListArticlesResponseSchema)(
        articles,
      );
    }),
  ),

  // 2. Endpoint to get article content
  Http.router.post(
    "/api/get-article-content",
    Effect.gen(function* () {
      const request = yield* Http.request.ServerRequest;
      const body = yield* request.schemaBodyJson(
        Schema.GetArticleContentRequestSchema,
      );

      const notionService = yield* NotionService;
      const content = yield* notionService.getArticleContent(
        body.apiKey,
        body.pageId,
      );

      return yield* Http.response.schemaJson(
        Schema.GetArticleContentResponseSchema,
      )({ content });
    }),
  ),

  // 3. Endpoint to update article content
  Http.router.post(
    "/api/update-article-content",
    Effect.gen(function* () {
      const request = yield* Http.request.ServerRequest;
      const body = yield* request.schemaBodyJson(
        Schema.UpdateArticleContentRequestSchema,
      );

      const notionService = yield* NotionService;
      yield* notionService.updateArticleContent(
        body.apiKey,
        body.pageId,
        body.content,
      );

      // On success, return a 204 No Content response
      return Http.response.empty({ status: 204 });
    }),
  ),
);

// Create the final Http App, including error handling
export const app = Http.router.toHttpApp(router).pipe(
  // Catch our specific NotionError and format it as a 500 response
  Http.middleware.catchTag("NotionError", (e) =>
    Http.response.json(
      {
        error: "Internal Server Error",
        cause: e.cause, // Include the underlying cause for debugging
      },
      { status: 500 },
    ),
  ),
);
