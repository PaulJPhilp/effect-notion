// test/NotionService.more.integration.test.ts
import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import * as dotenv from "dotenv";
import { NotionService } from "../../../NotionService.js";
import { AppConfigProviderLive } from "../../../config.js";
import { NotionClient } from "../../../NotionClient.js";

// Load env
dotenv.config();

const { NOTION_DATABASE_ID, NOTION_PAGE_ID, NOTION_STRESS_TEST } = process.env;

const TestLayer = Layer.provide(
  NotionService.Default,
  Layer.merge(NotionClient.Default, AppConfigProviderLive)
);

// Run only when creds exist
describe.skipIf(!process.env.NOTION_API_KEY || !NOTION_PAGE_ID || !NOTION_DATABASE_ID)(
  "NotionService (More Integration)",
  () => {
    it(
        "listArticles should return items from the database",
        async () =>
          await Effect.runPromise(
            Effect.gen(function* () {
              const svc = yield* NotionService;
              const items = yield* svc.listArticles(
                NOTION_DATABASE_ID!,
                "Name",
              );
  
              expect(Array.isArray(items.results)).toBe(true);
              // Basic shape assertions
              for (const it of items.results) {
                expect(typeof it.id).toBe("string");
                expect(typeof it.title).toBe("string");
              }
            }).pipe(Effect.provide(TestLayer)),
          ),
        30000,
      );

    it(
      "getArticleContent returns a string for a valid page",
      async () =>
        await Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* NotionService;
            const content = yield* svc.getArticleContent(
              NOTION_PAGE_ID!,
            );
            expect(typeof content).toBe("string");
          }).pipe(Effect.provide(TestLayer)),
        ),
      30000,
    );

    it.skipIf(NOTION_STRESS_TEST !== "1")(
      "updateArticleContent handles batching (>100 blocks) and round-trips",
      async () =>
        await Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* NotionService;
            const pageId = NOTION_PAGE_ID!;

            // Create > 200 lines so append batching is exercised
            const lines = Array.from({ length: 205 }, (_, i) =>
              `Line ${i + 1}`,
            );
            const big = lines.join("\n");

            const original: string = yield* svc.getArticleContent(
              pageId,
            );

            // Use+assert, then always restore original content
            yield* Effect.gen(function* () {
              yield* svc.updateArticleContent(pageId, big);
              const readBack = yield* svc.getArticleContent(pageId);
              expect(readBack).toBe(big);
            }).pipe(
              Effect.ensuring(
                svc
                  .updateArticleContent(pageId, original)
                  .pipe(Effect.orDie),
              ),
            );
          }).pipe(Effect.provide(TestLayer)),
        ),
      60000,
    );

    it(
      "fails with NotFoundError on missing page",
      async () =>
        await Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* NotionService;
            const missingPageId =
              "00000000-0000-0000-0000-000000000000";

            const exit = yield* Effect.exit(
              svc.getArticleContent(missingPageId),
            );

            expect(exit._tag).toBe("Failure");
            if (exit._tag === "Failure") {
              const pretty = String(exit.cause);
              expect(pretty).toContain("NotFoundError");
            }
          }).pipe(Effect.provide(TestLayer)),
        ),
      20000,
    );
  },
);

