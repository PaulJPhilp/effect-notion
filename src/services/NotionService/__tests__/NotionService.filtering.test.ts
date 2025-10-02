import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { NotionService } from "../../../NotionService.js";
import {
  AppConfigProviderLive,
  LogicalFieldOverridesService,
} from "../../../config.js";
import { NotionClient } from "../../../NotionClient.js";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

const { NOTION_DATABASE_ID } = process.env;

const TestLayer = Layer.provide(
  NotionService.Default,
  Layer.mergeAll(
    NotionClient.Default,
    AppConfigProviderLive,
    LogicalFieldOverridesService.Live
  )
);

describe.skipIf(!process.env.NOTION_API_KEY || !NOTION_DATABASE_ID)(
  "NotionService listArticles filtering/sorting (Integration)",
  () => {
    it(
      "forwards a timestamp filter to Notion API",
      async () => {
        const result = await Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* NotionService;
            const filter = {
              timestamp: "last_edited_time",
              last_edited_time: {
                on_or_after: "1970-01-01T00:00:00.000Z",
              },
            } as const;
            const articles = yield* svc.listArticles(
              NOTION_DATABASE_ID!,
              undefined,
              filter,
            );
            return articles.results;
          }).pipe(Effect.provide(TestLayer)),
        );

        expect(Array.isArray(result)).toBe(true);
      },
      20000,
    );

    it(
      "forwards a timestamp sort to Notion API",
      async () => {
        const result = await Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* NotionService;
            const sorts = [
              { timestamp: "last_edited_time", direction: "descending" as const },
            ];
            const articles = yield* svc.listArticles(
              NOTION_DATABASE_ID!,
              undefined,
              undefined,
              sorts,
            );
            return articles.results;
          }).pipe(Effect.provide(TestLayer)),
        );

        expect(Array.isArray(result)).toBe(true);
      },
      20000,
    );
  },
);
