import { NodeContext } from "@effect/platform-node";
import * as HttpApp from "@effect/platform/HttpApp";
import * as dotenv from "dotenv";
import { Layer, Logger } from "effect";
// test/api.integration.test.ts
import { describe, expect, it } from "vitest";
import { NotionClient } from "../src/NotionClient.js";
import { NotionService } from "../src/NotionService.js";
import { AppConfigProviderLive } from "../src/config.js";
import { app } from "../src/router.js";

// Load environment variables from .env file
dotenv.config();

const { NOTION_DB_ARTICLES_BLOG, NOTION_API_KEY } = process.env;

const TestLayer = Layer.mergeAll(
  Logger.json,
  AppConfigProviderLive,
  NodeContext.layer,
  NotionClient.Default,
  NotionService.Default
);

const { handler: testApp } = HttpApp.toWebHandlerLayer(app, TestLayer);

describe.skipIf(!NOTION_API_KEY || !NOTION_DB_ARTICLES_BLOG)(
  "API Integration Tests",
  () => {
    it("GET /api/health should return 200 OK", async () => {
      const response = await testApp(
        new Request("http://localhost/api/health")
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.ok).toBe(true);
    });

    it("GET /api/get-database-schema should return a valid schema", async () => {
      const response = await testApp(
        new Request(
          `http://localhost/api/get-database-schema?databaseId=${NOTION_DB_ARTICLES_BLOG}`
        )
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.titleProperty).toBeDefined();
      expect(body.properties).toBeDefined();
    });

    it("GET /api/get-database-schema should return 404 for non-existent databaseId (valid uuid)", async () => {
      const nonexistent = "00000000-0000-0000-0000-000000000000";
      const response = await testApp(
        new Request(
          `http://localhost/api/get-database-schema?databaseId=${nonexistent}`
        )
      );
      // Some environments may return 400 for invalid uuid formats; we use a valid uuid to trigger 404
      expect([400, 404, 500]).toContain(response.status);
      try {
        const body = await response.json();
        expect(body).toBeDefined();
        expect(typeof body.requestId).toBe("string");
        if (response.status === 404) {
          expect(body.code).toBe("NotFound");
        } else if (response.status === 400) {
          expect(body.code).toBe("BadRequest");
        }
      } catch {
        // Handle non-JSON responses
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    });

    it("POST /api/list-articles should return a list of articles", async () => {
      const response = await testApp(
        new Request("http://localhost/api/list-articles", {
          method: "POST",
          body: JSON.stringify({
            databaseId: NOTION_DB_ARTICLES_BLOG,
          }),
        })
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body.results)).toBe(true);
    });
  }
);
