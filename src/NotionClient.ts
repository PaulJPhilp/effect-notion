// src/NotionClient.ts
import { Data, Effect, Layer, ReadonlyArray } from "effect";
import { HttpClient, HttpClientRequest } from "@effect/platform";
import { Schema } from "@effect/schema";

// =============================================================================
// Errors
// =============================================================================

export class NotionError extends Data.TaggedError("NotionError")<{
  readonly cause: unknown;
}> {}

// =============================================================================
// Models (Schemas for Notion API responses)
// =============================================================================

export const NotionListResponseSchema = Schema.Struct({
  results: Schema.Array(Schema.Any),
  has_more: Schema.Boolean,
  next_cursor: Schema.OptionFromNullOr(Schema.String),
});
export type NotionListResponse = Schema.Schema.To<
  typeof NotionListResponseSchema
>;

// =============================================================================
// Service Definition (`Effect.Service` pattern)
// =============================================================================

export class NotionClient extends Effect.Service("NotionClient") {
  // Define the interface of our service
  abstract readonly queryDatabase: (
    apiKey: string,
    databaseId: string,
  ) => Effect.Effect<NotionListResponse, NotionError>;

  abstract readonly retrieveBlockChildren: (
    apiKey: string,
    pageId: string,
  ) => Effect.Effect<NotionListResponse, NotionError>;

  abstract readonly deleteBlock: (
    apiKey: string,
    blockId: string,
  ) => Effect.Effect<void, NotionError>;

  abstract readonly appendBlockChildren: (
    apiKey: string,
    pageId: string,
    blocks: ReadonlyArray<{ object: "block"; type: any; [key: string]: any }>,
  ) => Effect.Effect<unknown, NotionError>;
}

// =============================================================================
// Live Implementation
// =============================================================================

export const NotionClientLive = NotionClient.implement(
  Effect.gen(function* () {
    const defaultClient = yield* HttpClient.HttpClient;

    const withNotionHeaders = (apiKey: string) =>
      HttpClientRequest.patchHeaders({
        Authorization: `Bearer ${apiKey}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      });

    const performRequest = <A>(
      request: HttpClientRequest.Request,
      schema: Schema.Schema<A>,
    ) =>
      defaultClient(request).pipe(
        Effect.flatMap((response) => response.schemaBodyJson(schema)),
        Effect.mapError((cause) => new NotionError({ cause })),
      );

    const performRequestUnit = (request: HttpClientRequest.Request) =>
      defaultClient(request).pipe(
        Effect.filterOrFail(
          (response) => response.status >= 200 && response.status < 300,
          (response) =>
            new NotionError({
              cause: `Request failed with status ${response.status}`,
            }),
        ),
        Effect.asUnit,
        Effect.mapError((cause) => new NotionError({ cause })),
      );

    // Return an object that implements the NotionClient interface
    return {
      queryDatabase: (apiKey, databaseId) =>
        HttpClientRequest.post(
          `https://api.notion.com/v1/databases/${databaseId}/query`,
        ).pipe(
          withNotionHeaders(apiKey),
          performRequest(NotionListResponseSchema),
        ),

      retrieveBlockChildren: (apiKey, pageId) =>
        HttpClientRequest.get(
          `https://api.notion.com/v1/blocks/${pageId}/children`,
        ).pipe(
          withNotionHeaders(apiKey),
          performRequest(NotionListResponseSchema),
        ),

      deleteBlock: (apiKey, blockId) =>
        HttpClientRequest.del(
          `https://api.notion.com/v1/blocks/${blockId}`,
        ).pipe(withNotionHeaders(apiKey), performRequestUnit),

      appendBlockChildren: (apiKey, pageId, blocks) =>
        HttpClientRequest.patch(
          `https://api.notion.com/v1/blocks/${pageId}/children`,
        ).pipe(
          HttpClientRequest.jsonBody({ children: blocks }),
          withNotionHeaders(apiKey),
          performRequest(Schema.Any),
        ),
    };
  }),
).pipe(Layer.provide(HttpClient.layer));
