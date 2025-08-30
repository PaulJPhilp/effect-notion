import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { NotionClient, InvalidApiKeyError, NotFoundError, InternalServerError } from "../../../NotionClient.js";
import * as dotenv from "dotenv";

dotenv.config();

const { NOTION_API_KEY, NOTION_DATABASE_ID, NOTION_PAGE_ID } = process.env;

describe.skipIf(!NOTION_API_KEY || !NOTION_DATABASE_ID || !NOTION_PAGE_ID)(
  "NotionClient (Integration)",
  () => {
    const apiKey = NOTION_API_KEY!;
    const databaseId = NOTION_DATABASE_ID!;
    const pageId = NOTION_PAGE_ID!;

    it("retrieveDatabase should return database for valid ID", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.retrieveDatabase(apiKey, databaseId);
        }).pipe(Effect.provide(NotionClient.Default)),
      );
      expect(result.object).toBe("database");
      expect(result.id).toBe(databaseId);
    }, 20000);

    it("retrieveDatabase should fail with NotFoundError for invalid ID", async () => {
      const invalidDatabaseId = "00000000-0000-0000-0000-000000000000";
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.retrieveDatabase(apiKey, invalidDatabaseId);
        }).pipe(Effect.provide(NotionClient.Default)),
      );
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toContain("NotFoundError");
      }
    }, 20000);

    it("retrieveDatabase should fail with InvalidApiKeyError for bad API key", async () => {
      const badApiKey = "bad_key";
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.retrieveDatabase(badApiKey, databaseId);
        }).pipe(Effect.provide(NotionClient.Default)),
      );
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toContain("InvalidApiKeyError");
      }
    }, 20000);

    it("queryDatabase should return page list for valid ID", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.queryDatabase(apiKey, databaseId);
        }).pipe(Effect.provide(NotionClient.Default)),
      );
      expect(result.object).toBe("list");
      expect(Array.isArray(result.results)).toBe(true);
    }, 20000);

    it("queryDatabase should fail with NotFoundError for invalid ID", async () => {
      const invalidDatabaseId = "00000000-0000-0000-0000-000000000000";
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.queryDatabase(apiKey, invalidDatabaseId);
        }).pipe(Effect.provide(NotionClient.Default)),
      );
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toContain("NotFoundError");
      }
    }, 20000);

    it("retrieveBlockChildren should return block list for valid page ID", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.retrieveBlockChildren(apiKey, pageId);
        }).pipe(Effect.provide(NotionClient.Default)),
      );
      expect(result.object).toBe("list");
      expect(Array.isArray(result.results)).toBe(true);
    }, 20000);

    it("retrieveBlockChildren should fail with NotFoundError for invalid page ID", async () => {
      const invalidPageId = "00000000-0000-0000-0000-000000000000";
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.retrieveBlockChildren(apiKey, invalidPageId);
        }).pipe(Effect.provide(NotionClient.Default)),
      );
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toContain("NotFoundError");
      }
    }, 20000);

    it("deleteBlock should succeed for a valid block ID", async () => {
      // To test delete, we need to create a block first.
      // This requires a page that allows appending blocks.
      // For simplicity, we'll use the NOTION_PAGE_ID and append a paragraph.
      const blocksToAppend = [
        {
          object: "block" as const,
          type: "paragraph" as const,
          paragraph: {
            rich_text: [
              {
                type: "text" as const,
                text: { content: "Block to be deleted" },
              },
            ],
          },
        },
      ] as const;

      const appendResult = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.appendBlockChildren(apiKey, pageId, blocksToAppend);
        }).pipe(Effect.provide(NotionClient.Default)),
      );
      expect(appendResult.results.length).toBeGreaterThan(0);
      const newBlockId = appendResult.results[0]!.id;

      const deleteResult = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.deleteBlock(apiKey, newBlockId);
        }).pipe(Effect.provide(NotionClient.Default)),
      );
      expect(deleteResult._tag).toBe("Success");
    }, 20000);

    it("deleteBlock should fail with InternalServerError for invalid block ID", async () => {
      const invalidBlockId = "00000000-0000-0000-0000-000000000000";
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.deleteBlock(apiKey, invalidBlockId);
        }).pipe(Effect.provide(NotionClient.Default)),
      );
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toContain("InternalServerError");
      }
    }, 20000);

    it("appendBlockChildren should succeed for valid page ID", async () => {
      const blocksToAppend = [
        {
          object: "block" as const,
          type: "paragraph" as const,
          paragraph: {
            rich_text: [
              {
                type: "text" as const,
                text: { content: "Appended block content" },
              },
            ],
          },
        },
      ] as const;
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.appendBlockChildren(apiKey, pageId, blocksToAppend);
        }).pipe(Effect.provide(NotionClient.Default)),
      );
      expect(result.object).toBe("list");
      expect(result.results.length).toBeGreaterThan(0);

      // Clean up the appended block
      expect(result.results.length).toBeGreaterThan(0);
      const newBlockId = result.results[0]!.id;
      await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.deleteBlock(apiKey, newBlockId);
        }).pipe(Effect.provide(NotionClient.Default)),
      );
    }, 20000);

    it("appendBlockChildren should fail with InternalServerError for invalid page ID", async () => {
      const invalidPageId = "00000000-0000-0000-0000-000000000000";
      const blocksToAppend = [
        {
          object: "block" as const,
          type: "paragraph" as const,
          paragraph: {
            rich_text: [
              {
                type: "text" as const,
                text: { content: "Appended block content" },
              },
            ],
          },
        },
      ] as const;
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.appendBlockChildren(apiKey, invalidPageId, blocksToAppend);
        }).pipe(Effect.provide(NotionClient.Default)),
      );
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toContain("InternalServerError");
      }
    }, 20000);
  },
);
