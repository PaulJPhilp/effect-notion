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

const { NOTION_DATABASE_ID, NOTION_API_KEY, NOTION_PAGE_ID } = process.env;

const TestLayer = Layer.mergeAll(
  Logger.json,
  AppConfigProviderLive,
  NodeContext.layer,
  NotionClient.Default,
  NotionService.Default
);

const { handler: testApp } = HttpApp.toWebHandlerLayer(app, TestLayer);

describe.skipIf(!NOTION_API_KEY || !NOTION_DATABASE_ID)(
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
          `http://localhost/api/get-database-schema?databaseId=${NOTION_DATABASE_ID}`
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
      expect([404]).toContain(response.status);
      const body = await response.json();
      expect(body).toBeDefined();
      expect(typeof body.requestId).toBe("string");
      expect(body.code).toBe("NotFound");
    });

    it("POST /api/list-articles should return a list of articles", async () => {
      const response = await testApp(
        new Request("http://localhost/api/list-articles", {
          method: "POST",
          body: JSON.stringify({
            databaseId: NOTION_DATABASE_ID,
          }),
        })
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(Array.isArray(body.results)).toBe(true);
    });

    it.skipIf(!NOTION_PAGE_ID)(
      "GET /api/get-article-metadata should return metadata for a page",
      async () => {
        const response = await testApp(
          new Request(
            `http://localhost/api/get-article-metadata?pageId=${NOTION_PAGE_ID}`
          )
        );
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.id).toBe(NOTION_PAGE_ID);
        expect(body.properties).toBeDefined();
      }
    );

    it.skipIf(!NOTION_PAGE_ID)(
      "GET /api/get-article-content should return content for a page",
      async () => {
        const response = await testApp(
          new Request(
            `http://localhost/api/get-article-content?pageId=${NOTION_PAGE_ID}`
          )
        );
        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.content).toBeDefined();
      }
    );

    it.skipIf(!NOTION_PAGE_ID)(
      "POST /api/update-article-content should update the content of a page",
      async () => {
        const newContent = "Hello, world!";
        const response = await testApp(
          new Request("http://localhost/api/update-article-content", {
            method: "POST",
            body: JSON.stringify({
              pageId: NOTION_PAGE_ID,
              content: newContent,
            }),
          })
        );
        expect(response.status).toBe(204);

        // Verify the content was updated
        const verifyResponse = await testApp(
          new Request(
            `http://localhost/api/get-article-content?pageId=${NOTION_PAGE_ID}`
          )
        );
        const body = await verifyResponse.json();
        expect(body.content).toContain(newContent);
      },
      20000
    );
  }
);
