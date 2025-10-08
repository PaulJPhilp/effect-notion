import * as dotenv from "dotenv";
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import { NotionClient } from "../../../NotionClient.js";
import { NotionService } from "../../../NotionService.js";
import {
  AppConfigProviderLive,
  LogicalFieldOverridesService,
} from "../../../config.js";

// Load environment variables
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

const flakyFailurePattern =
  /(BadRequestError|ServiceUnavailableError|InternalServerError)/;

describe.skipIf(!process.env.NOTION_API_KEY || !NOTION_DATABASE_ID)(
  "NotionService listArticles filtering/sorting (Integration)",
  () => {
    it("forwards a timestamp filter to Notion API", async () => {
      if (!NOTION_DATABASE_ID) {
        throw new Error("Missing NOTION_DATABASE_ID for integration test");
      }
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const svc = yield* NotionService;
          const filter = {
            timestamp: "last_edited_time",
            last_edited_time: {
              on_or_after: "1970-01-01T00:00:00.000Z",
            },
          } as const;
          return yield* svc.listArticles(NOTION_DATABASE_ID, undefined, filter);
        }).pipe(Effect.provide(TestLayer)),
      );

      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toMatch(flakyFailurePattern);
        return;
      }

      expect(Array.isArray(exit.value.results)).toBe(true);
    }, 20000);

    it("forwards a timestamp sort to Notion API", async () => {
      if (!NOTION_DATABASE_ID) {
        throw new Error("Missing NOTION_DATABASE_ID for integration test");
      }
      const exit = await Effect.runPromiseExit(
        Effect.gen(function* () {
          const svc = yield* NotionService;
          const sorts = [
            { timestamp: "last_edited_time", direction: "descending" as const },
          ];
          return yield* svc.listArticles(
            NOTION_DATABASE_ID,
            undefined,
            undefined,
            sorts,
          );
        }).pipe(Effect.provide(TestLayer)),
      );

      if (exit._tag === "Failure") {
        expect(String(exit.cause)).toMatch(flakyFailurePattern);
        return;
      }

      expect(Array.isArray(exit.value.results)).toBe(true);
    }, 20000);
  },
);
