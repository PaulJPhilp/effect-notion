
// test/api.integration.test.ts
import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { app } from "../src/router.js";
import { NotionClient } from "../src/NotionClient.js";
import { NotionService } from "../src/NotionService.js";
import { AppConfigProviderLive } from "../src/config.js";
import * as Http from "@effect/platform/HttpClient";
import * as HttpApp from "@effect/platform/HttpApp";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const { NOTION_DATABASE_ID, NOTION_API_KEY, NOTION_PAGE_ID } = process.env;

const TestLayer = Layer.provide(
  NotionService.Default,
  Layer.merge(NotionClient.Default, AppConfigProviderLive)
);

const testApp = app.pipe(HttpApp.provideLayer(TestLayer));

describe.skipIf(!NOTION_API_KEY || !NOTION_DATABASE_ID)("API Integration Tests", () => {
  it("GET /api/health should return 200 OK", async () => {
    const response = await HttpApp.run(testApp, Http.request.get("/api/health"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.ok).toBe(true);
  });

  it("GET /api/get-database-schema should return a valid schema", async () => {
    const response = await HttpApp.run(
      testApp,
      Http.request.get(`/api/get-database-schema?databaseId=${NOTION_DATABASE_ID}`)
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.titleProperty).toBeDefined();
    expect(body.properties).toBeDefined();
  });

  it("GET /api/get-database-schema should return 404 for invalid databaseId", async () => {
    const response = await HttpApp.run(
      testApp,
      Http.request.get("/api/get-database-schema?databaseId=invalid-id")
    );
    expect(response.status).toBe(404);
  });

  it("POST /api/list-articles should return a list of articles", async () => {
    const response = await HttpApp.run(
      testApp,
      Http.request.post("/api/list-articles", {
        body: Http.body.unsafeJson({
          databaseId: NOTION_DATABASE_ID,
          titlePropertyName: "Name",
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
      const response = await HttpApp.run(
        testApp,
        Http.request.get(`/api/get-article-metadata?pageId=${NOTION_PAGE_ID}`)
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
      const response = await HttpApp.run(
        testApp,
        Http.request.get(`/api/get-article-content?pageId=${NOTION_PAGE_ID}`)
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
      const response = await HttpApp.run(
        testApp,
        Http.request.post("/api/update-article-content", {
          body: Http.body.unsafeJson({
            pageId: NOTION_PAGE_ID,
            content: newContent,
          }),
        })
      );
      expect(response.status).toBe(204);

      // Verify the content was updated
      const verifyResponse = await HttpApp.run(
        testApp,
        Http.request.get(`/api/get-article-content?pageId=${NOTION_PAGE_ID}`)
      );
      const body = await verifyResponse.json();
      expect(body.content).toContain(newContent);
    }
  );
});
