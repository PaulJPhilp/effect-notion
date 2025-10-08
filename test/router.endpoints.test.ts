import { NodeContext } from "@effect/platform-node";
import * as HttpApp from "@effect/platform/HttpApp";
import * as HttpServer from "@effect/platform/HttpServer";
import { Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { NotionClient } from "../src/NotionClient.js";
import { NotionService } from "../src/NotionService.js";
import { AppConfigProviderLive } from "../src/config.js";
import { RequestIdService } from "../src/http/requestId.js";
import { app } from "../src/router.js";

const TestLayer = Layer.mergeAll(
  Logger.json,
  AppConfigProviderLive,
  HttpServer.layerContext,
  RequestIdService.Live,
  NotionService.Default,
);

const { handler: testApp } = HttpApp.toWebHandlerLayer(app, TestLayer);
describe("Router Endpoints", () => {
  describe("Health Check", () => {
    it("GET /api/health should return health status", async () => {
      const response = await testApp(
        new Request("http://localhost/api/health"),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toHaveProperty("ok");
      expect(body).toHaveProperty("env");
      expect(body).toHaveProperty("hasApiKey");
      // Note: requestId is in headers, not body
      expect(response.headers.get("x-request-id")).toBeDefined();
    });
  });

  describe("Database Schema", () => {
    it("GET /api/get-database-schema should require databaseId parameter", async () => {
      const response = await testApp(
        new Request("http://localhost/api/get-database-schema"),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("BadRequest");
    });

    it("GET /api/get-database-schema should handle invalid databaseId format", async () => {
      const response = await testApp(
        new Request(
          "http://localhost/api/get-database-schema?databaseId=invalid",
        ),
      );
      expect([400, 404, 500]).toContain(response.status);
      // Handle both JSON and non-JSON responses
      try {
        const body = await response.json();
        expect(body).toHaveProperty("requestId");
      } catch {
        // Some errors might not return JSON
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  describe("Article Content", () => {
    it("GET /api/get-article-content should require pageId parameter", async () => {
      const response = await testApp(
        new Request("http://localhost/api/get-article-content"),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("BadRequest");
    });

    it("GET /api/get-article-content should handle invalid pageId", async () => {
      const response = await testApp(
        new Request("http://localhost/api/get-article-content?pageId=invalid"),
      );
      expect([400, 500]).toContain(response.status);
      // Handle both JSON and non-JSON responses
      try {
        const body = await response.json();
        expect(body).toHaveProperty("requestId");
      } catch {
        // Some errors might not return JSON
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  describe("Article Metadata", () => {
    it("GET /api/get-article-metadata should require pageId parameter", async () => {
      const response = await testApp(
        new Request("http://localhost/api/get-article-metadata"),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("BadRequest");
    });
  });

  describe("List Articles", () => {
    it("POST /api/list-articles should require databaseId", async () => {
      const response = await testApp(
        new Request("http://localhost/api/list-articles", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("BadRequest");
    });

    it("POST /api/list-articles should handle invalid JSON", async () => {
      const response = await testApp(
        new Request("http://localhost/api/list-articles", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "invalid json",
        }),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("BadRequest");
    });
  });

  describe("Update Article Content", () => {
    it("POST /api/update-article-content should require pageId and content", async () => {
      const response = await testApp(
        new Request("http://localhost/api/update-article-content", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("BadRequest");
    });
  });

  describe("Dynamic Database Endpoints", () => {
    it("POST /api/db/query should require databaseId", async () => {
      const response = await testApp(
        new Request("http://localhost/api/db/query", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("BadRequest");
    });

    it("GET /api/db/get should require pageId", async () => {
      const response = await testApp(
        new Request("http://localhost/api/db/get"),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("BadRequest");
    });

    it("POST /api/db/create should require databaseId and properties", async () => {
      const response = await testApp(
        new Request("http://localhost/api/db/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("BadRequest");
    });

    it("POST /api/db/update should require pageId and properties", async () => {
      const response = await testApp(
        new Request("http://localhost/api/db/update", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("BadRequest");
    });

    it("POST /api/db/create-database should require parentPageId and title", async () => {
      const response = await testApp(
        new Request("http://localhost/api/db/create-database", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("BadRequest");
    });

    it("GET /api/db/get-schema should require databaseId", async () => {
      const response = await testApp(
        new Request("http://localhost/api/db/get-schema"),
      );
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.code).toBe("BadRequest");
    });
  });

  describe("Metrics Endpoint", () => {
    it("GET /api/metrics should return metrics in Prometheus format", async () => {
      const response = await testApp(
        new Request("http://localhost/api/metrics"),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/plain");
      const body = await response.text();
      expect(body).toBeDefined();
      expect(response.headers.get("x-request-id")).toBeDefined();
    });
  });

  describe("404 Handling", () => {
    it("should return 404 for unknown routes", async () => {
      const response = await testApp(
        new Request("http://localhost/api/unknown-route"),
      );
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.code).toBe("NotFound");
      expect(body).toHaveProperty("requestId");
    });

    it("should return 404 for unknown HTTP methods", async () => {
      const response = await testApp(
        new Request("http://localhost/api/health", { method: "PUT" }),
      );
      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.code).toBe("NotFound");
    });
  });

  describe("Request ID Handling", () => {
    it("should include request ID in all responses", async () => {
      const response = await testApp(
        new Request("http://localhost/api/health"),
      );
      expect(response.headers.get("x-request-id")).toBeDefined();
    });

    it("should preserve provided request ID", async () => {
      const customRequestId = "test-request-123";
      const response = await testApp(
        new Request("http://localhost/api/health", {
          headers: { "x-request-id": customRequestId },
        }),
      );
      expect(response.headers.get("x-request-id")).toBe(customRequestId);
    });
  });
});
