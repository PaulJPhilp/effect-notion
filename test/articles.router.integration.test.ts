import { NodeContext } from "@effect/platform-node";
import * as HttpApp from "@effect/platform/HttpApp";
import { Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { app } from "../src/router.js";
import { AppConfigProviderLive } from "../src/config.js";
import { NotionClient } from "../src/NotionClient.js";
import { NotionService } from "../src/NotionService.js";
import { ArticlesRepository } from "../src/services/ArticlesRepository.js";

const { NOTION_API_KEY, NOTION_DB_ARTICLES_BLOG } = process.env;

const TestLayer = Layer.mergeAll(
  Logger.json,
  AppConfigProviderLive,
  NodeContext.layer,
  ArticlesRepository.Default,
  NotionClient.Default,
  NotionService.Default
);

const { handler: testApp } = HttpApp.toWebHandlerLayer(app, TestLayer);

// Live integration tests for Articles router.
// These tests require a configured Notion integration and database.
describe.skipIf(!NOTION_API_KEY || !NOTION_DB_ARTICLES_BLOG)(
  "Articles Router (integration)",
  () => {
    it("POST /api/articles/list should return a list for source=blog", async () => {
      const res = await testApp(
        new Request("http://localhost/api/articles/list", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "blog", pageSize: 5 }),
        })
      );
      if (res.status !== 200) {
        console.error("/api/articles/list body:", await res.text());
      }
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.results)).toBe(true);
    });
  }
);
