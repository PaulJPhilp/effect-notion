// test/NotionService.integration.test.ts
import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { test } from "@effect/test";
import { NotionService, NotionServiceLive } from "@/NotionService";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const { NOTION_API_KEY, NOTION_PAGE_ID } = process.env;

// Conditionally skip the entire test suite if credentials are not provided
describe.skipIf(!NOTION_API_KEY || !NOTION_PAGE_ID)(
  "NotionService (Integration)",
  () => {
    it("should update a real Notion page and then restore it", () =>
      Effect.gen(function* () {
        const service = yield* NotionService;
        const apiKey = NOTION_API_KEY!;
        const pageId = NOTION_PAGE_ID!;

        const testContent = `This is a test run at ${new Date().toISOString()}.
Second line.`;

        // The core test logic is wrapped in acquireRelease to guarantee cleanup
        const testWithCleanup = Effect.acquireRelease(
          // 1. Acquire: Get the original content of the page
          service
            .getArticleContent(apiKey, pageId)
            .pipe(
              Effect.tap(() =>
                Effect.log("Acquired original page content."),
              ),
            ),

          // 2. Use: Run the test assertions
          () =>
            Effect.gen(function* () {
              // Update the page with new test content
              yield* service.updateArticleContent(
                apiKey,
                pageId,
                testContent,
              );
              Effect.log("Updated page with test content.");

              // Read the content back from the API
              const newContent = yield* service.getArticleContent(
                apiKey,
                pageId,
              );

              // Assert that the update was successful
              expect(newContent).toBe(testContent);
            }),

          // 3. Release: Restore the page to its original content
          (originalContent) =>
            service
              .updateArticleContent(apiKey, pageId, originalContent)
              .pipe(
                Effect.tap(() =>
                  Effect.log("Successfully restored page content."),
                ),
                Effect.orDie, // If cleanup fails, it's a critical error
              ),
        );

        // Execute the entire acquire-use-release flow
        yield* testWithCleanup;
      }).pipe(
        // Provide the REAL service layer for this integration test
        Effect.provide(NotionServiceLive),
        // Set a longer timeout to account for network latency
        test({ timeout: 20000 }),
      ));
  },
);
