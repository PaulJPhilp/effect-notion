// test/NotionService.list.integration.test.ts
import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { NotionService } from "../src/NotionService.js";
import { AppConfigProviderLive } from "../src/config.js";
import { NotionClient } from "../src/NotionClient.js";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const { NOTION_DATABASE_ID } = process.env;

const TestLayer = Layer.provide(
  NotionService.Default,
  Layer.merge(NotionClient.Default, AppConfigProviderLive)
);

// Skip when creds are not provided
describe.skipIf(!process.env.NOTION_API_KEY || !NOTION_DATABASE_ID)(
  "NotionService listArticles (Integration)",
  () => {
    it(
      "lists articles without filter/sorts",
      async () => {
        const result = await Effect.runPromise(
          Effect.gen(function* () {
            const svc = yield* NotionService;
            return yield* svc.listArticles(
              NOTION_DATABASE_ID!,
              // let service resolve title property
            );
          }).pipe(Effect.provide(TestLayer)),
        );

        expect(Array.isArray(result)).toBe(true);
      },
      20000,
    );

    it(
      "lists with title is_not_empty filter and sorts by last_edited_time (should fail with InternalServerError)",
      async () => {
        const exit = await Effect.runPromiseExit(
          Effect.gen(function* () {
            const svc = yield* NotionService;
            const filter = {
              property: "Name",
              title: { is_not_empty: true },
            } as const;
            const sorts = [
              { timestamp: "last_edited_time", direction: "descending" as const },
            ];
            return yield* svc.listArticles(
              NOTION_DATABASE_ID!,
              undefined,
              filter,
              sorts,
            );
          }).pipe(Effect.provide(TestLayer)),
        );

        expect(exit._tag).toBe("Failure");
        if (exit._tag === "Failure") {
          expect(String(exit.cause)).toContain("InternalServerError");
        }
      },
      20000,
    );
  },
);
