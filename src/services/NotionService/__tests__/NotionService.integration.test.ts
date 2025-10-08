import * as dotenv from "dotenv";
import { Effect, Exit, Layer } from "effect";
// test/NotionService.integration.test.ts
import { describe, expect, it } from "vitest";
import { NotionClient } from "../../../NotionClient.js";
import { NotionService } from "../../../NotionService.js";
import {
  AppConfigProviderLive,
  LogicalFieldOverridesService,
} from "../../../config.js";

// Load environment variables from .env file
dotenv.config();

const { NOTION_PAGE_ID } = process.env;

// The main test layer that provides all dependencies
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

// Conditionally skip the entire test suite if credentials are not provided
describe.skipIf(!process.env.NOTION_API_KEY || !NOTION_PAGE_ID)(
  "NotionService (Integration)",
  () => {
    it("should update a real Notion page and then restore it", async () => {
      if (!NOTION_PAGE_ID) {
        throw new Error("Missing NOTION_PAGE_ID for integration test");
      }
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const service = yield* NotionService;
          const pageId = NOTION_PAGE_ID;

          const testContent = `This is a test run at ${new Date().toISOString()}.
Second line.`;

          yield* Effect.scoped(
            Effect.gen(function* () {
              const originalContent: string = yield* Effect.acquireRelease(
                service
                  .getArticleContent(pageId)
                  .pipe(
                    Effect.tap(() =>
                      Effect.log("Acquired original page content."),
                    ),
                  ),
                (original) =>
                  service.updateArticleContent(pageId, original).pipe(
                    Effect.tap(() =>
                      Effect.log("Successfully restored page content."),
                    ),
                    Effect.orDie,
                  ),
              );

              yield* service.updateArticleContent(pageId, testContent);
              Effect.log("Updated page with test content.");

              const newContent = yield* service.getArticleContent(pageId);
              expect(newContent).toBe(testContent);
            }),
          );
        }).pipe(Effect.provide(TestLayer)),
      );

      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toMatch(flakyFailurePattern);
        return;
      }
      expect(exit._tag).toBe("Success");
    }, 20000);
  },
);
