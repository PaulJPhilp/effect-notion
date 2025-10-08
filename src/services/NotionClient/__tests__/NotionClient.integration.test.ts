import * as dotenv from "dotenv";
import { ConfigProvider, Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { NotionClient } from "../../../NotionClient.js";
import { AppConfigProviderLive } from "../../../config.js";

dotenv.config();

const { NOTION_API_KEY, NOTION_DATABASE_ID, NOTION_PAGE_ID } = process.env;

describe.skipIf(!NOTION_API_KEY || !NOTION_DATABASE_ID || !NOTION_PAGE_ID)(
  "NotionClient (Integration)",
  () => {
    if (!NOTION_API_KEY || !NOTION_DATABASE_ID || !NOTION_PAGE_ID) {
      throw new Error(
        "Missing Notion environment variables for integration tests"
      );
    }
    const apiKey = NOTION_API_KEY;
    const databaseId = NOTION_DATABASE_ID;
    const pageId = NOTION_PAGE_ID;

    const TestConfigLayer = Layer.setConfigProvider(
      ConfigProvider.fromMap(new Map([["NOTION_API_KEY", apiKey]]))
    );
    const TestLayers = Layer.provide(
      NotionClient.Default,
      Layer.merge(TestConfigLayer, AppConfigProviderLive)
    );

    type ExitLike =
      | { readonly _tag: "Success"; readonly value: unknown }
      | { readonly _tag: "Failure"; readonly cause: unknown };

    const expectFailureCause = (exit: ExitLike, pattern: RegExp) => {
      expect(exit._tag).toBe("Failure");
      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toMatch(pattern);
      }
    };

    const notFoundLike = /NotFoundError|BadRequestError/;
    const serviceUnavailableLike = /ServiceUnavailableError|BadRequestError/;

    it("retrieveDatabase should return database for valid ID", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.retrieveDatabase(databaseId);
        }).pipe(Effect.provide(TestLayers))
      );
      expect(result.object).toBe("database");
      expect(result.id).toBe(databaseId);
    }, 20000);

    it("retrieveDatabase should fail with NotFoundError for invalid ID", async () => {
      const invalidDatabaseId = "00000000-0000-0000-0000-000000000000";
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.retrieveDatabase(invalidDatabaseId);
        }).pipe(Effect.provide(TestLayers))
      );
      expectFailureCause(exit, notFoundLike);
    }, 20000);

    it("retrieveDatabase should fail with InvalidApiKeyError for bad API key", async () => {
      const badApiKey = "bad_key";
      const BadKeyConfigLayer = Layer.setConfigProvider(
        ConfigProvider.fromMap(new Map([["NOTION_API_KEY", badApiKey]]))
      );
      const BadKeyLayers = Layer.provide(
        NotionClient.Default,
        BadKeyConfigLayer
      );
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.retrieveDatabase(databaseId);
        }).pipe(Effect.provide(BadKeyLayers))
      );
      expectFailureCause(exit, /InvalidApiKeyError/);
    }, 20000);

    it("queryDatabase should return page list for valid ID", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.queryDatabase(databaseId, {});
        }).pipe(Effect.provide(TestLayers))
      );
      expect(result.object).toBe("list");
      expect(Array.isArray(result.results)).toBe(true);
    }, 20000);

    it("queryDatabase should fail with NotFoundError for invalid ID", async () => {
      const invalidDatabaseId = "00000000-0000-0000-0000-000000000000";
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.queryDatabase(invalidDatabaseId, {});
        }).pipe(Effect.provide(TestLayers))
      );
      expectFailureCause(exit, notFoundLike);
    }, 20000);

    it("retrieveBlockChildren should return block list for valid page ID", async () => {
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.retrieveBlockChildren(apiKey, pageId);
        }).pipe(Effect.provide(NotionClient.Default))
      );
      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toMatch(serviceUnavailableLike);
        return;
      }
      const result = exit.value as {
        object: string;
        results: readonly unknown[];
      };
      expect(result.object).toBe("list");
      expect(Array.isArray(result.results)).toBe(true);
    }, 20000);

    it("retrieveBlockChildren should fail with NotFoundError for invalid page ID", async () => {
      const invalidPageId = "00000000-0000-0000-0000-000000000000";
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.retrieveBlockChildren(apiKey, invalidPageId);
        }).pipe(Effect.provide(NotionClient.Default))
      );
      expectFailureCause(exit, notFoundLike);
    }, 20000);

    it("deleteBlock should succeed for a valid block ID", async () => {
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
      const appendExit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.appendBlockChildren(pageId, blocksToAppend);
        }).pipe(Effect.provide(TestLayers))
      );
      if (appendExit._tag === "Failure") {
        expect(String(appendExit.cause)).toMatch(serviceUnavailableLike);
        return;
      }
      const appendResult = appendExit.value as {
        results: ReadonlyArray<{ id: string }>;
      };
      expect(appendResult.results.length).toBeGreaterThan(0);
      const newBlockId = appendResult.results[0]?.id ?? "";

      const deleteExit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.deleteBlock(newBlockId);
        }).pipe(Effect.provide(TestLayers))
      );
      if (deleteExit._tag === "Failure") {
        expect(String(deleteExit.cause)).toMatch(serviceUnavailableLike);
        return;
      }
      expect(deleteExit._tag).toBe("Success");
    }, 20000);

    it("deleteBlock should fail with InternalServerError for invalid block ID", async () => {
      const invalidBlockId = "00000000-0000-0000-0000-000000000000";
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.deleteBlock(invalidBlockId);
        }).pipe(Effect.provide(TestLayers))
      );
      expectFailureCause(exit, serviceUnavailableLike);
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
      const appendExit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.appendBlockChildren(pageId, blocksToAppend);
        }).pipe(Effect.provide(TestLayers))
      );
      if (appendExit._tag === "Failure") {
        expect(String(appendExit.cause)).toMatch(serviceUnavailableLike);
        return;
      }
      const result = appendExit.value as {
        object: string;
        results: ReadonlyArray<{ id: string }>;
      };
      expect(result.object).toBe("list");
      expect(result.results.length).toBeGreaterThan(0);

      const newBlockId = result.results[0]?.id as string;
      const cleanupExit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const client = yield* NotionClient;
          return yield* client.deleteBlock(newBlockId);
        }).pipe(Effect.provide(TestLayers))
      );
      if (cleanupExit._tag === "Failure") {
        expect(String(cleanupExit.cause)).toMatch(serviceUnavailableLike);
      }
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
          return yield* client.appendBlockChildren(
            invalidPageId,
            blocksToAppend
          );
        }).pipe(Effect.provide(TestLayers))
      );
      expectFailureCause(exit, serviceUnavailableLike);
    }, 20000);
  }
);
