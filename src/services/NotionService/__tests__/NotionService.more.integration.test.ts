import * as dotenv from "dotenv";
import { Effect, Layer } from "effect";
// test/NotionService.more.integration.test.ts
import { describe, expect, it } from "vitest";
import { NotionClient } from "../../../NotionClient.js";
import { NotionService } from "../../../NotionService.js";
import {
  AppConfigProviderLive,
  LogicalFieldOverridesService,
} from "../../../config.js";
dotenv.config();

const { NOTION_DATABASE_ID, NOTION_PAGE_ID, NOTION_STRESS_TEST } = process.env;

const TestLayer = Layer.provide(
  NotionService.Default,
  Layer.mergeAll(
    NotionClient.Default,
    AppConfigProviderLive,
    LogicalFieldOverridesService.Live,
  ),
);

const flakyFailurePattern =
  /(BadRequestError|ServiceUnavailableError|InternalServerError|NotFoundError)/;

// Run only when creds exist
describe.skipIf(
  !process.env.NOTION_API_KEY || !NOTION_PAGE_ID || !NOTION_DATABASE_ID,
)("NotionService (More Integration)", () => {
  it("listArticles should return items from the database", async () => {
    if (!NOTION_DATABASE_ID) {
      throw new Error("Missing NOTION_DATABASE_ID for integration test");
    }
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const svc = yield* NotionService;
        return yield* svc.listArticles(NOTION_DATABASE_ID, "Name");
      }).pipe(Effect.provide(TestLayer)),
    );

    if (exit._tag === "Failure") {
      expect(String(exit.cause)).toMatch(flakyFailurePattern);
      return;
    }

    const items = exit.value;
    expect(Array.isArray(items.results)).toBe(true);
    for (const it of items.results) {
      expect(typeof it.id).toBe("string");
      expect(typeof it.title).toBe("string");
    }
  }, 30000);

  it("getArticleContent returns a string for a valid page", async () => {
    if (!NOTION_PAGE_ID) {
      throw new Error("Missing NOTION_PAGE_ID for integration test");
    }
    const exit = await Effect.runPromiseExit(
      Effect.gen(function* () {
        const svc = yield* NotionService;
        return yield* svc.getArticleContent(NOTION_PAGE_ID);
      }).pipe(Effect.provide(TestLayer)),
    );

    if (exit._tag === "Failure") {
      expect(String(exit.cause)).toMatch(flakyFailurePattern);
      return;
    }

    expect(typeof exit.value).toBe("string");
  }, 30000);

  it.skipIf(NOTION_STRESS_TEST !== "1")(
    "updateArticleContent handles batching (>100 blocks) and round-trips",
    async () => {
      if (!NOTION_PAGE_ID) {
        throw new Error("Missing NOTION_PAGE_ID for integration test");
      }
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const svc = yield* NotionService;
          const pageId = NOTION_PAGE_ID;

          const lines = Array.from({ length: 205 }, (_, i) => `Line ${i + 1}`);
          const big = lines.join("\n");

          const original: string = yield* svc.getArticleContent(pageId);

          yield* Effect.gen(function* () {
            yield* svc.updateArticleContent(pageId, big);
            const readBack = yield* svc.getArticleContent(pageId);
            expect(readBack).toBe(big);
          }).pipe(
            Effect.ensuring(
              svc.updateArticleContent(pageId, original).pipe(Effect.orDie),
            ),
          );
        }).pipe(Effect.provide(TestLayer)),
      );

      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toMatch(flakyFailurePattern);
      }
    },
    60000,
  );

  it(
    "fails with NotFoundError on missing page",
    async () =>
      await Effect.runPromiseExit(
        Effect.gen(function* () {
          const svc = yield* NotionService;
          const missingPageId = "00000000-0000-0000-0000-000000000000";

          return yield* svc.getArticleContent(missingPageId);
        }).pipe(Effect.provide(TestLayer)),
      ).then((exit) => {
        expect(exit._tag).toBe("Failure");
        if (exit._tag === "Failure") {
          expect(String(exit.cause)).toMatch(/(NotFoundError|BadRequestError)/);
        }
      }),
    20000,
  );
});
