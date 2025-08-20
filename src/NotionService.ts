// src/NotionService.ts
import { Effect, Layer, ReadonlyArray, Chunk } from "effect";
import {
  NotionClient,
  NotionError,
  NotionListResponse,
} from "./NotionClient";
import { Schema } from "@effect/schema";

// =============================================================================
// Schemas for safely parsing Notion's 'any' responses
// =============================================================================

const NotionPageSchema = Schema.Struct({
  id: Schema.String,
  properties: Schema.Struct({
    // Assuming the main title property is named "Name" or "Title".
    // This might need adjustment based on the actual database schema.
    Name: Schema.Struct({
      title: Schema.Array(
        Schema.Struct({ plain_text: Schema.String }),
      ),
    }),
  }),
});

const NotionBlockSchema = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  paragraph: Schema.optional(
    Schema.Struct({
      rich_text: Schema.Array(
        Schema.Struct({ plain_text: Schema.String }),
      ),
    }),
  ),
});

// =============================================================================
// Service Definition (`Effect.Service` pattern)
// =============================================================================

export class NotionService extends Effect.Service("NotionService") {
  // High-level interface matching our API needs
  abstract readonly listArticles: (
    apiKey: string,
    databaseId: string,
  ) => Effect.Effect<
    ReadonlyArray<{ id: string; title: string }>,
    NotionError
  >;

  abstract readonly getArticleContent: (
    apiKey: string,
    pageId: string,
  ) => Effect.Effect<string, NotionError>;

  abstract readonly updateArticleContent: (
    apiKey: string,
    pageId: string,
    content: string,
  ) => Effect.Effect<void, NotionError>;
}

// =============================================================================
// Live Implementation
// =============================================================================

export const NotionServiceLive = NotionService.implement(
  Effect.gen(function* () {
    const notionClient = yield* NotionClient;

    // A reusable helper to handle Notion's cursor-based pagination
    const getAllPaginatedResults = (
      fetchFn: (
        cursor?: string,
      ) => Effect.Effect<NotionListResponse, NotionError>,
    ) =>
      Effect.paginate(fetchFn(), (response) =>
        response.has_more && response.next_cursor.isSome()
          ? Effect.succeed(fetchFn(response.next_cursor.value))
          : Effect.fail(void 0),
      ).pipe(
        Effect.map((chunk) => chunk.flatMap((res) => res.results)),
        Effect.scoped, // Paginate is scoped, so we must lift it
      );

    return {
      // 1. Implements listing articles
      listArticles: (apiKey, databaseId) =>
        notionClient.queryDatabase(apiKey, databaseId).pipe(
          Effect.flatMap((response) =>
            Schema.decode(Schema.Array(NotionPageSchema))(response.results),
          ),
          Effect.map((pages) =>
            pages.map((page) => ({
              id: page.id,
              // Safely extract title, providing a fallback
              title:
                page.properties.Name.title[0]?.plain_text ?? "Untitled",
            })),
          ),
          Effect.mapError(
            (cause) => new NotionError({ cause: "Schema decoding failed" }),
          ),
        ),

      // 2. Implements fetching and concatenating all page content
      getArticleContent: (apiKey, pageId) =>
        getAllPaginatedResults(() =>
          notionClient.retrieveBlockChildren(apiKey, pageId),
        ).pipe(
          Effect.flatMap((blocks) =>
            Schema.decode(Schema.Array(NotionBlockSchema))(blocks),
          ),
          Effect.map((blocks) =>
            blocks
              .filter((block) => block.type === "paragraph")
              .flatMap(
                (block) =>
                  block.paragraph?.rich_text.map((rt) => rt.plain_text) ??
                  [],
              )
              .join("\n"),
          ),
          Effect.mapError(
            (cause) => new NotionError({ cause: "Schema decoding failed" }),
          ),
        ),

      // 3. Implements the full "delete-then-append" update logic
      updateArticleContent: (apiKey, pageId, content) =>
        Effect.gen(function* () {
          // First, get all existing block IDs
          const existingBlocks = yield* getAllPaginatedResults(() =>
            notionClient.retrieveBlockChildren(apiKey, pageId),
          );
          const blockIds = yield* Schema.decode(
            Schema.Array(Schema.Struct({ id: Schema.String })))
            (existingBlocks).pipe(
            Effect.map((blocks) => blocks.map((b) => b.id)),
            Effect.mapError(
              (cause) =>
                new NotionError({ cause: "Failed to decode block IDs" }),
            ),
          );

          // Delete all existing blocks in parallel
          yield* Effect.forEach(blockIds, (id) => notionClient.deleteBlock(apiKey, id), {
            concurrency: "unbounded",
          });

          // Create new paragraph blocks from the content string
          const newBlocks = content.split("\n").map((line) => ({
            object: "block" as const,
            type: "paragraph" as const,
            paragraph: {
              rich_text: [{ type: "text" as const, text: { content: line } }],
            },
          }));

          // Append new blocks in batches of 100 (Notion API limit)
          const batches = Chunk.chunksOf(newBlocks, 100);
          yield* Effect.forEach(batches, (batch) =>
            notionClient.appendBlockChildren(apiKey, pageId, Chunk.toReadonlyArray(batch)),
          );
        }).pipe(Effect.asUnit),
    };
  }),
).pipe(Layer.provide(NotionClientLive)); // Provide the dependency
