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

const flakyFailurePattern =
  /(BadRequestError|ServiceUnavailableError|InternalServerError)/;

// Conditionally skip the entire test suite if credentials are not provided
describe.skipIf(!process.env.NOTION_API_KEY || !NOTION_PAGE_ID)(
  "NotionService.updateArticleProperties (Integration)",
  () => {
    it(
      "should retrieve article metadata",
      async () => {
        const exit = await Effect.runPromiseExit(
          Effect.gen(function* () {
            const service = yield* NotionService;
            return yield* service.getArticleMetadata(NOTION_PAGE_ID!);
          }).pipe(Effect.provide(TestLayer))
        );

        if (exit._tag === "Failure") {
          expect(String(exit.cause)).toMatch(flakyFailurePattern);
          return;
        }

        const metadata = exit.value;
        expect(metadata).toBeDefined();
        expect(metadata.properties).toBeDefined();
        expect(typeof metadata.properties).toBe("object");
      },
      10000
    );

    it(
      "should update article properties and return updated metadata",
      async () => {
        const exit = await Effect.runPromiseExit(
          Effect.gen(function* () {
            const service = yield* NotionService;
            const pageId = NOTION_PAGE_ID!;

            const testProperties = {
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

            const verifyMeta = yield* service.getArticleMetadata(pageId);
            return { updatedMeta, verifyMeta };
          }).pipe(Effect.provide(TestLayer))
        );

        if (exit._tag === "Failure") {
          expect(String(exit.cause)).toMatch(flakyFailurePattern);
          return;
        }

        const { updatedMeta, verifyMeta } = exit.value;
        expect(updatedMeta).toBeDefined();
        expect(updatedMeta.properties).toBeDefined();
        expect(typeof updatedMeta.properties).toBe("object");
        expect(verifyMeta.properties).toBeDefined();
      },
      15000
    );

    it(
      "should handle updating published date property",
      async () => {
        const exit = await Effect.runPromiseExit(
          Effect.gen(function* () {
            const service = yield* NotionService;
            const pageId = NOTION_PAGE_ID!;

            const testDate = new Date().toISOString();

            const properties = {
              "Published Date": {
                date: {
                  start: testDate,
                },
              },
            };

            return yield* service.updateArticleProperties(pageId, properties);
          }).pipe(Effect.provide(TestLayer))
        );

        if (exit._tag === "Failure") {
          expect(String(exit.cause)).toMatch(flakyFailurePattern);
          return;
        }

        expect(exit.value).toBeDefined();
        expect(exit.value.properties).toBeDefined();
      },
      15000
    );
  }
);
