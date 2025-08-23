// src/NotionClient.ts
import { Data, Effect, Layer, Schedule } from "effect";
import * as S from "effect/Schema";
import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as HttpClientResponse from "@effect/platform/HttpClientResponse";
import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as NotionSchema from "./NotionSchema.js";

// --- Errors (remain the same) ---
export type NotionError =
  | InvalidApiKeyError
  | NotFoundError
  | InternalServerError;

export class InvalidApiKeyError extends Data.TaggedError("InvalidApiKeyError")<{
  readonly cause: unknown;
}> {}
export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly cause: unknown;
}> {}
export class InternalServerError extends Data.TaggedError("InternalServerError")<{
  readonly cause: unknown;
}> {}

// --- Service Definition using Effect.Service ---
export class NotionClient extends Effect.Service<NotionClient>()(
  "NotionClient",
  {
    accessors: true,
    dependencies: [FetchHttpClient.layer],
    effect: Effect.gen(function* () {
      // Base HttpClient with transient retries
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.retryTransient({ times: 5 })
      );

      

      const withNotionHeaders = (apiKey: string) =>
        HttpClientRequest.setHeaders({
          Authorization: `Bearer ${apiKey}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        });

      const performRequest = <A, I>(
        request: HttpClientRequest.HttpClientRequest,
        schema: S.Schema<A, I, never>,
      ): Effect.Effect<A, NotionError> =>
        client.execute(request).pipe(
          // Map transport-level errors (no response) to InternalServerError
          Effect.mapError((cause) => new InternalServerError({ cause })),
          Effect.flatMap((response) => {
            if (response.status === 401) {
              return Effect.fail(
                new InvalidApiKeyError({ cause: undefined }),
              ) as Effect.Effect<never, NotionError>;
            }
            if (response.status === 404) {
              return Effect.fail(
                new NotFoundError({ cause: undefined }),
              ) as Effect.Effect<never, NotionError>;
            }
            if (response.status >= 400) {
              return Effect.fail(
                new InternalServerError({ cause: undefined }),
              ) as Effect.Effect<never, NotionError>;
            }

            return HttpClientResponse.schemaBodyJson(schema)(response).pipe(
              Effect.mapError((cause) => new InternalServerError({ cause })),
            );
          }),
        );

      const performRequestUnit = (
        request: HttpClientRequest.HttpClientRequest,
      ): Effect.Effect<void, NotionError> =>
        client.execute(request).pipe(
          Effect.mapError((cause) => new InternalServerError({ cause })),
          Effect.flatMap((response) => {
            if (response.status === 401)
              return Effect.fail(
                new InvalidApiKeyError({ cause: undefined }),
              ) as Effect.Effect<never, NotionError>;
            if (response.status === 404)
              return Effect.fail(
                new NotFoundError({ cause: undefined }),
              ) as Effect.Effect<never, NotionError>;
            if (response.status >= 400)
              return Effect.fail(
                new InternalServerError({ cause: undefined }),
              ) as Effect.Effect<never, NotionError>;

            return Effect.succeed(void 0);
          }),
        );

      return {
        retrieveDatabase: (apiKey: string, databaseId: string) =>
          performRequest(
            HttpClientRequest.get(
              `https://api.notion.com/v1/databases/${databaseId}`,
            ).pipe(withNotionHeaders(apiKey)),
            NotionSchema.DatabaseSchema,
          ),

        queryDatabase: (
          apiKey: string,
          databaseId: string,
          body?: {
            filter?: unknown;
            sorts?: unknown;
            start_cursor?: string;
            page_size?: number;
          },
        ) =>
          performRequest(
            HttpClientRequest.post(
              `https://api.notion.com/v1/databases/${databaseId}/query`,
            ).pipe(
              body && (body.filter || body.sorts || body.start_cursor || body.page_size)
                ? HttpClientRequest.bodyUnsafeJson(body)
                : (req) => req,
              withNotionHeaders(apiKey),
            ),
            NotionSchema.PageListResponseSchema,
          ),

        retrieveBlockChildren: (
          apiKey: string,
          pageId: string,
          cursor?: string,
        ) =>
          performRequest(
            HttpClientRequest.get(
              cursor
                ? `https://api.notion.com/v1/blocks/${pageId}/children?start_cursor=${encodeURIComponent(cursor)}`
                : `https://api.notion.com/v1/blocks/${pageId}/children`,
            ).pipe(withNotionHeaders(apiKey)),
            NotionSchema.BlockListResponseSchema,
          ),

        deleteBlock: (apiKey: string, blockId: string) =>
          performRequestUnit(
            HttpClientRequest.del(
              `https://api.notion.com/v1/blocks/${blockId}`,
            ).pipe(withNotionHeaders(apiKey)),
          ),

        appendBlockChildren: (
          apiKey: string,
          pageId: string,
          blocks: ReadonlyArray<NotionSchema.NotionBlockInput>,
        ) =>
          HttpClientRequest.patch(
            `https://api.notion.com/v1/blocks/${pageId}/children`,
          ).pipe(
            // Use unsafe body to keep the builder pure
            HttpClientRequest.bodyUnsafeJson({ children: blocks }),
            withNotionHeaders(apiKey),
            (req) => performRequest(req, NotionSchema.BlockListResponseSchema),
          ),
      };
    }),
  },
) {}
