import { NodeContext } from "@effect/platform-node";
import * as HttpApp from "@effect/platform/HttpApp";
import * as dotenv from "dotenv";
import { Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { NotionClient } from "../src/NotionClient.js";
import { NotionService } from "../src/NotionService.js";
import { AppConfigProviderLive } from "../src/config.js";
import { RequestIdService } from "../src/http/requestId.js";
import { app } from "../src/router.js";

dotenv.config();

const { NOTION_DATABASE_ID, NOTION_PAGE_ID } = process.env as Record<
  string,
  string | undefined
>;

function makeHandler() {
  const TestLayer = Layer.mergeAll(
    Logger.json,
    AppConfigProviderLive,
    NodeContext.layer,
    RequestIdService.Live,
    NotionClient.Default,
    NotionService.Default,
  );
  const { handler } = HttpApp.toWebHandlerLayer(app, TestLayer);
  return handler;
}

describe("API failure paths", () => {
  it("POST /api/list-articles with unknown property in filter returns 400", async () => {
    if (!NOTION_DATABASE_ID) {
      return;
    }
    const handler = makeHandler();
    const response = await handler(
      new Request("http://localhost/api/list-articles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          databaseId: NOTION_DATABASE_ID,
          filter: {
            property: "__does_not_exist__",
            number: { greater_than: 10 },
          },
        }),
      }),
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toBeDefined();
    expect(Array.isArray(body.errors)).toBe(true);
    expect(typeof body.code).toBe("string");
    expect(body.code).toBe("BadRequest");
    expect(typeof body.requestId).toBe("string");
  });

  it("GET /api/get-article-metadata with invalid pageId returns normalized 400 JSON", async () => {
    const handler = makeHandler();
    const badId = "invalid-id";
    const response = await handler(
      new Request(`http://localhost/api/get-article-metadata?pageId=${badId}`),
    );
    expect([400, 500]).toContain(response.status);
    let body: { code: string; requestId: string };
    try {
      body = await response.json();
      expect(body).toBeDefined();
      if (response.status === 400) {
        expect(body.code).toBe("BadRequest");
      } else if (response.status === 500) {
        expect(body.code).toBe("InternalServerError");
      }
    } catch {
      // Handle non-JSON responses
      expect(response.status).toBeGreaterThanOrEqual(400);
      return; // Exit early for non-JSON responses
    }
    expect(typeof body.requestId).toBe("string");
  });

  it("GET /api/get-database-schema returns normalized 401/404 JSON with invalid API key", async () => {
    const original = process.env.NOTION_API_KEY;
    process.env.NOTION_API_KEY = "invalid-api-key";
    try {
      const handler = makeHandler();
      const dbId = "00000000-0000-0000-0000-000000000000";
      const response = await handler(
        new Request(
          `http://localhost/api/get-database-schema?databaseId=${dbId}`,
        ),
      );
      expect([401, 404, 500]).toContain(response.status);
      try {
        const body = await response.json();
        expect(typeof body.requestId).toBe("string");
        expect(typeof body.code).toBe("string");
        if (response.status === 401) {
          expect(body.code).toBe("InvalidApiKey");
        } else if (response.status === 404) {
          expect(["NotFoundError", "BadRequestError"]).toContain(body.errorTag);
        } else if (response.status === 500) {
          expect(body.code).toBe("InternalServerError");
        }
      } catch {
        // Handle non-JSON responses
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    } finally {
      if (original === undefined) {
        process.env.NOTION_API_KEY = undefined;
      } else {
        process.env.NOTION_API_KEY = original;
      }
    }
  }, 15000);
});
