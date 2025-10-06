import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as HttpClientResponse from "@effect/platform/HttpClientResponse";
// src/NotionClient.ts
import { Data, Effect } from "effect";
import type * as S from "effect/Schema";
import * as NotionSchema from "../NotionSchema.js";

// --- Errors (remain the same) ---
export type NotionError =
  | InvalidApiKeyError
  | NotFoundError
  | BadRequestError
  | InternalServerError;

export class InvalidApiKeyError extends Data.TaggedError("InvalidApiKeyError")<{
  readonly cause: unknown;
}> { }
export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly cause: unknown;
}> { }
export class BadRequestError extends Data.TaggedError("BadRequestError")<{
  readonly cause: unknown;
}> { }
export class InternalServerError extends Data.TaggedError(
  "InternalServerError"
)<{
  readonly cause: unknown;
}> { }

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
        schema: S.Schema<A, I, never>
      ): Effect.Effect<A, NotionError> =>
        client.execute(request).pipe(
          // Map transport-level errors (no response) to InternalServerError
          Effect.mapError((cause) => new InternalServerError({ cause })),
          Effect.flatMap((response) => {
            if (response.status === 401) {
              return Effect.fail(
                new InvalidApiKeyError({ cause: undefined })
              ) as Effect.Effect<never, NotionError>;
            }
            if (response.status === 404) {
              return Effect.fail(
                new NotFoundError({ cause: undefined })
              ) as Effect.Effect<never, NotionError>;
            }
            if (response.status === 400 || response.status === 422) {
              return response.text.pipe(
                Effect.catchAll(() => Effect.succeed("")),
                Effect.tap((body) =>
                  Effect.logWarning(
                    `Notion BadRequest ${response.status}: ${body}`
                  )
                ),
                Effect.flatMap((body) =>
                  Effect.fail(
                    new BadRequestError({ cause: `${response.status}:${body}` })
                  )
                )
              ) as Effect.Effect<never, NotionError>;
            }
            if (response.status >= 400) {
              return response.text.pipe(
                Effect.catchAll(() => Effect.succeed("")),
                Effect.tap((body) =>
                  Effect.logWarning(
                    `Notion Error ${response.status}: ${body}`
                  )
                ),
                Effect.flatMap((body) =>
                  Effect.fail(
                    new InternalServerError({ cause: `${response.status}:${body}` })
                  )
                )
              ) as Effect.Effect<never, NotionError>;
            }

            return HttpClientResponse.schemaBodyJson(schema)(response).pipe(
              Effect.mapError((cause) => new InternalServerError({ cause }))
            );
          })
        );

      const performRequestUnit = (
        request: HttpClientRequest.HttpClientRequest
      ): Effect.Effect<void, NotionError> =>
        client.execute(request).pipe(
          Effect.mapError((cause) => new InternalServerError({ cause })),
          Effect.flatMap((response) => {
            if (response.status === 401)
              return Effect.fail(
                new InvalidApiKeyError({ cause: undefined })
              ) as Effect.Effect<never, NotionError>;
            if (response.status === 404)
              return Effect.fail(
                new NotFoundError({ cause: undefined })
              ) as Effect.Effect<never, NotionError>;
            if (response.status === 400 || response.status === 422)
              return response.text.pipe(
                Effect.catchAll(() => Effect.succeed("")),
                Effect.tap((body) =>
                  Effect.logWarning(
                    `Notion BadRequest ${response.status}: ${body}`
                  )
                ),
                Effect.flatMap((body) =>
                  Effect.fail(new BadRequestError({ cause: body }))
                )
              ) as Effect.Effect<never, NotionError>;
            if (response.status >= 400)
              return response.text.pipe(
                Effect.catchAll(() => Effect.succeed("")),
                Effect.tap((body) =>
                  Effect.logWarning(
                    `Notion Error ${response.status}: ${body}`
                  )
                ),
                Effect.flatMap((body) =>
                  Effect.fail(new InternalServerError({ cause: body }))
                )
              ) as Effect.Effect<never, NotionError>;

            return Effect.succeed(void 0);
          })
        );

      return {
        retrievePage: (apiKey: string, pageId: string) =>
          performRequest(
            HttpClientRequest.get(
              `https://api.notion.com/v1/pages/${pageId}`
            ).pipe(withNotionHeaders(apiKey)),
            NotionSchema.PageSchema
          ),

        createPage: (
          apiKey: string,
          databaseId: string,
          properties: Record<string, unknown>
        ) =>
          performRequest(
            HttpClientRequest.post(`https://api.notion.com/v1/pages`).pipe(
              HttpClientRequest.bodyUnsafeJson({
                parent: { database_id: databaseId },
                properties,
              }),
              withNotionHeaders(apiKey)
            ),
            NotionSchema.PageSchema
          ),

        updatePage: (
          apiKey: string,
          pageId: string,
          body: { properties?: Record<string, unknown>; archived?: boolean }
        ) =>
          performRequest(
            HttpClientRequest.patch(
              `https://api.notion.com/v1/pages/${pageId}`
            ).pipe(
              HttpClientRequest.bodyUnsafeJson(body),
              withNotionHeaders(apiKey)
            ),
            NotionSchema.PageSchema
          ),

        retrieveDatabase: (apiKey: string, databaseId: string) =>
          performRequest(
            HttpClientRequest.get(
              `https://api.notion.com/v1/databases/${databaseId}`
            ).pipe(withNotionHeaders(apiKey)),
            NotionSchema.DatabaseSchema
          ),

        queryDatabase: (
          apiKey: string,
          databaseId: string,
          body?: {
            filter?: unknown;
            sorts?: unknown;
            start_cursor?: string;
            page_size?: number;
          }
        ) =>
          performRequest(
            HttpClientRequest.post(
              `https://api.notion.com/v1/databases/${databaseId}/query`
            ).pipe(
              body &&
                (body.filter ||
                  body.sorts ||
                  body.start_cursor ||
                  body.page_size)
                ? HttpClientRequest.bodyUnsafeJson(body)
                : (req) => req,
              withNotionHeaders(apiKey)
            ),
            NotionSchema.PageListResponseSchema
          ),

        retrieveBlockChildren: (
          apiKey: string,
          pageId: string,
          cursor?: string
        ) =>
          performRequest(
            HttpClientRequest.get(
              cursor
                ? `https://api.notion.com/v1/blocks/${pageId}/children?start_cursor=${encodeURIComponent(
                  cursor
                )}`
                : `https://api.notion.com/v1/blocks/${pageId}/children`
            ).pipe(withNotionHeaders(apiKey)),
            NotionSchema.BlockListResponseSchema
          ),

        deleteBlock: (apiKey: string, blockId: string) =>
          performRequestUnit(
            HttpClientRequest.del(
              `https://api.notion.com/v1/blocks/${blockId}`
            ).pipe(withNotionHeaders(apiKey))
          ),

        appendBlockChildren: (
          apiKey: string,
          pageId: string,
          blocks: ReadonlyArray<NotionSchema.NotionBlockInput>
        ) =>
          HttpClientRequest.patch(
            `https://api.notion.com/v1/blocks/${pageId}/children`
          ).pipe(
            // Use unsafe body to keep the builder pure
            HttpClientRequest.bodyUnsafeJson({ children: blocks }),
            withNotionHeaders(apiKey),
            (req) => performRequest(req, NotionSchema.BlockListResponseSchema)
          ),
      };
    }),
  }
) { }

// Test-only helper to classify status codes and include body as the cause.
// This mirrors the logic inside performRequest/performRequestUnit without
// changing runtime behavior. Intended for unit tests.
export const __test__mapStatusToError = (
  status: number,
  body: string,
): NotionError | undefined => {
  if (status === 401) return new InvalidApiKeyError({ cause: undefined });
  if (status === 404) return new NotFoundError({ cause: undefined });
  if (status === 400 || status === 422)
    return new BadRequestError({ cause: body });
  if (status >= 400) return new InternalServerError({ cause: body });
  return undefined;
};
