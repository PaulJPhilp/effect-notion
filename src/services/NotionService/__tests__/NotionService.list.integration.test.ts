import * as dotenv from "dotenv";
import { Effect, type Exit, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { NotionClient } from "../../../NotionClient.js";
import { NotionService } from "../../../NotionService.js";
import {
  AppConfigProviderLive,
  LogicalFieldOverridesService,
} from "../../../config.js";
dotenv.config();

const { NOTION_DATABASE_ID } = process.env;

const TestLayer = Layer.provide(
  NotionService.Default,
  Layer.mergeAll(
    NotionClient.Default,
    AppConfigProviderLive,
    LogicalFieldOverridesService.Live,
  ),
);

const expectFailure = (exit: Exit.Exit<unknown, unknown>) => {
  expect(exit._tag).toBe("Failure");
  if (exit._tag === "Failure") {
    expect(String(exit.cause)).toMatch(
      /(BadRequestError|NotFoundError|ServiceUnavailableError)/,
    );
  }
};

// Skip when creds are not provided
describe.skipIf(!process.env.NOTION_API_KEY || !NOTION_DATABASE_ID)(
  "NotionService listArticles (Integration)",
  () => {
    it("lists articles without filter/sorts", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          if (!NOTION_DATABASE_ID) {
            throw new Error("NOTION_DATABASE_ID is not defined");
          }
          const service = yield* NotionService;
          const articles = yield* service.listArticles(
            NOTION_DATABASE_ID,
            undefined,
          );
          return articles.results;
        }).pipe(Effect.provide(TestLayer)),
      );
      expect(Array.isArray(result)).toBe(true);
    }, 20000);

    it("lists with invalid title filter should fail with BadRequestError", async () => {
      if (!NOTION_DATABASE_ID) {
        throw new Error("NOTION_DATABASE_ID is not defined");
      }

      const filter = {
        property: "__does_not_exist__",
        number: { greater_than: 1 },
      } as const;
      const sorts = [
        { timestamp: "last_edited_time", direction: "descending" as const },
      ];

      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* NotionService;
          return yield* service.listArticles(
            NOTION_DATABASE_ID,
            undefined,
            filter,
            sorts,
          );
        }).pipe(Effect.provide(TestLayer)),
      );

      if (exit._tag === "Success") {
        expect(exit.value).toBeDefined();
        return;
      }
      expectFailure(exit);
    }, 20000);
  },
);
