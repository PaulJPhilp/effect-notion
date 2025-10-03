// test/NotionService.updateProperties.test.ts
import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { NotionService } from "../../../NotionService.js";
import {
  AppConfigProviderLive,
  LogicalFieldOverridesService,
} from "../../../config.js";
import { NotionClient } from "../../../NotionClient.js";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const { NOTION_PAGE_ID } = process.env;

// The main test layer that provides all dependencies
const TestLayer = Layer.provide(
  NotionService.Default,
  Layer.mergeAll(
    NotionClient.Default,
    AppConfigProviderLive,
    LogicalFieldOverridesService.Live
  )
);

// Conditionally skip the entire test suite if credentials are not provided
describe.skipIf(!process.env.NOTION_API_KEY || !NOTION_PAGE_ID)(
  "NotionService.updateArticleProperties (Integration)",
  () => {
    it(
      "should retrieve article metadata",
      async () =>
        await Effect.runPromise(
          Effect.gen(function* () {
            const service = yield* NotionService;
            const pageId = NOTION_PAGE_ID!;

            const metadata = yield* service.getArticleMetadata(pageId);

            expect(metadata).toBeDefined();
            expect(metadata.properties).toBeDefined();
            expect(typeof metadata.properties).toBe("object");
          }).pipe(Effect.provide(TestLayer))
        ),
      10000
    );

    it(
      "should update article properties and return updated metadata",
      async () =>
        await Effect.runPromise(
          Effect.gen(function* () {
            const service = yield* NotionService;
            const pageId = NOTION_PAGE_ID!;

            // Get original metadata
            const originalMeta = yield* service.getArticleMetadata(pageId);

            // Update properties with a test value
            // Using a checkbox property as an example
            const testProperties = {
              // Example: toggle a checkbox or update a rich_text field
              // Adjust based on your actual page schema
              Status: {
                select: {
                  name: "Draft",
                },
              },
            };

            const updatedMeta = yield* service.updateArticleProperties(
              pageId,
              testProperties
            );

            expect(updatedMeta).toBeDefined();
            expect(updatedMeta.properties).toBeDefined();
            expect(typeof updatedMeta.properties).toBe("object");

            // Verify the update was applied by fetching again
            const verifyMeta = yield* service.getArticleMetadata(pageId);
            expect(verifyMeta.properties).toBeDefined();
          }).pipe(Effect.provide(TestLayer))
        ),
      15000
    );

    it(
      "should handle updating published date property",
      async () =>
        await Effect.runPromise(
          Effect.gen(function* () {
            const service = yield* NotionService;
            const pageId = NOTION_PAGE_ID!;

            const testDate = new Date().toISOString();

            // Update with a date property
            const properties = {
              "Published Date": {
                date: {
                  start: testDate,
                },
              },
            };

            const result = yield* service.updateArticleProperties(
              pageId,
              properties
            );

            expect(result).toBeDefined();
            expect(result.properties).toBeDefined();
          }).pipe(Effect.provide(TestLayer))
        ),
      15000
    );
  }
);
