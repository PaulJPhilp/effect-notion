// test/NotionService.integration.test.ts
import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { NotionService } from "../src/NotionService.js";
import { AppConfigProviderLive } from "../src/config.js";
import { NotionClient } from "../src/NotionClient.js";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const { NOTION_PAGE_ID } = process.env;

// The main test layer that provides all dependencies
const TestLayer = Layer.provide(
  NotionService.Default,
  Layer.merge(NotionClient.Default, AppConfigProviderLive)
);

// Conditionally skip the entire test suite if credentials are not provided
describe.skipIf(!process.env.NOTION_API_KEY || !NOTION_PAGE_ID)(
  "NotionService (Integration)",
  () => {
    it(
      "should update a real Notion page and then restore it",
      async () =>
        await Effect.runPromise(
          Effect.gen(function* () {
            const service = yield* NotionService;
            const pageId = NOTION_PAGE_ID!;

            const testContent = `This is a test run at ${new Date().toISOString()}.
Second line.`;

            // Use a scoped region with two-arg acquireRelease (acquire, release)
            yield* Effect.scoped(
              Effect.gen(function* () {
                const originalContent: string = yield* Effect.acquireRelease(
                  // Acquire: original content
                  service
                    .getArticleContent(pageId)
                    .pipe(
                      Effect.tap(() =>
                        Effect.log("Acquired original page content."),
                      ),
                    ),
                  // Release: restore original content
                  (original) =>
                    service
                      .updateArticleContent(pageId, original)
                      .pipe(
                        Effect.tap(() =>
                          Effect.log(
                            "Successfully restored page content.",
                          ),
                        ),
                        Effect.orDie,
                      ),
                );

                // Use: update and assert
                yield* service.updateArticleContent(
                  pageId,
                  testContent,
                );
                Effect.log("Updated page with test content.");

                const newContent = yield* service.getArticleContent(
                  pageId,
                );
                expect(newContent).toBe(testContent);
              }),
            );
          }).pipe(Effect.provide(TestLayer)),
        ),
      20000,
    );
  },
);

