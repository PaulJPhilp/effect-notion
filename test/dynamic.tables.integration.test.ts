import { NodeContext } from "@effect/platform-node";
import * as HttpApp from "@effect/platform/HttpApp";
import * as dotenv from "dotenv";
import { Layer, Logger } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppConfigProviderLive } from "../src/config.js";
import { RequestIdService } from "../src/http/requestId.js";
import { app } from "../src/router.js";
import type { SimpleDbSpec } from "../src/services/NotionService/helpers.js";
import { NotionService } from "../src/services/NotionService/service.js";

// Load environment variables from .env file
dotenv.config();

const { NOTION_API_KEY, NOTION_TEST_PARENT_PAGE_ID } = process.env;

const TestLayer = Layer.mergeAll(
  Logger.json,
  AppConfigProviderLive,
  NodeContext.layer,
  RequestIdService.Live,
  NotionService.Default
);

const { handler: testApp } = HttpApp.toWebHandlerLayer(app, TestLayer);

// Test database schema specification
const testDbSpec: SimpleDbSpec = {
  Name: { type: "title" },
  Status: {
    type: "select",
    options: ["Draft", "Published", "Archived"],
  },
  Tags: {
    type: "multi_select",
    options: ["tech", "news", "tutorial", "announcement"],
  },
  Views: { type: "number" },
  IsPublic: { type: "checkbox" },
  PublishedAt: { type: "date" },
  Url: { type: "url" },
  Author: { type: "people" },
  Score: { type: "formula", formulaType: "number" },
  Priority: { type: "status", options: ["Low", "Medium", "High"] },
};

let testDatabaseId: string;
let testPageId: string;

describe.skipIf(!NOTION_API_KEY || !NOTION_TEST_PARENT_PAGE_ID)(
  "Dynamic Tables Integration Tests",
  () => {
    beforeAll(async () => {
      // Create a test database for all tests
      const response = await testApp(
        new Request("http://localhost/api/db/create-database", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            parentPageId: NOTION_TEST_PARENT_PAGE_ID,
            title: `Test DB ${Date.now()}`,
            spec: testDbSpec,
          }),
        })
      );

      if (response.status !== 200) {
        throw new Error(
          `Failed to create test database: ${await response.text()}`
        );
      }

      const result = await response.json();
      testDatabaseId = result.databaseId;

      // Create a test page
      const pageResponse = await testApp(
        new Request("http://localhost/api/db/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            databaseId: testDatabaseId,
            properties: {
              Name: { title: [{ text: { content: "Test Article" } }] },
              Status: { select: { name: "Draft" } },
              Tags: { multi_select: [{ name: "tech" }, { name: "tutorial" }] },
              Views: { number: 42 },
              IsPublic: { checkbox: true },
              PublishedAt: { date: { start: "2025-01-15" } },
              Url: { url: "https://example.com/test" },
              Priority: { status: { name: "Medium" } },
            },
          }),
        })
      );

      if (pageResponse.status !== 200) {
        throw new Error(
          `Failed to create test page: ${await pageResponse.text()}`
        );
      }

      const pageResult = await pageResponse.json();
      testPageId = pageResult.pageId;
    });

    afterAll(async () => {
      // Clean up test database (if possible via API)
      // Note: Notion doesn't provide a direct API to delete databases
      // They would need to be archived/deleted manually in the UI
    });

    describe("Database Creation", () => {
      it("should create a database with the specified schema", async () => {
        const response = await testApp(
          new Request("http://localhost/api/db/create-database", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              parentPageId: NOTION_TEST_PARENT_PAGE_ID,
              title: `Test DB ${Date.now()}`,
              spec: testDbSpec,
            }),
          })
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.databaseId).toBeDefined();
        expect(typeof body.databaseId).toBe("string");
        expect(body.properties).toBeDefined();
        expect(Array.isArray(body.properties)).toBe(true);

        // Verify schema properties match our spec
        const propertyNames = body.properties.map(
          (p: { name: string }) => p.name
        );
        expect(propertyNames).toContain("Name");
        expect(propertyNames).toContain("Status");
        expect(propertyNames).toContain("Tags");
        expect(propertyNames).toContain("Views");
        expect(propertyNames).toContain("IsPublic");
        expect(propertyNames).toContain("PublishedAt");
        expect(propertyNames).toContain("Url");
        expect(propertyNames).toContain("Author");
        expect(propertyNames).toContain("Score");
        expect(propertyNames).toContain("Priority");
      });

      it("should handle invalid schema specifications", async () => {
        const response = await testApp(
          new Request("http://localhost/api/db/create-database", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              parentPageId: NOTION_TEST_PARENT_PAGE_ID,
              title: "Invalid DB",
              spec: {
                InvalidField: { type: "invalid_type" },
              },
            }),
          })
        );

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.code).toBeDefined();
      });
    });

    describe("Dynamic Schema Building", () => {
      it("should build runtime Effect schemas that match codegen", async () => {
        const response = await testApp(
          new Request(
            `http://localhost/api/db/get-schema?databaseId=${testDatabaseId}`
          )
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.schema).toBeDefined();
        expect(body.properties).toBeDefined();

        // Verify the schema includes expected property types
        const properties = body.properties;
        const nameProp = properties.find(
          (p: { name: string }) => p.name === "Name"
        );
        const statusProp = properties.find(
          (p: { name: string }) => p.name === "Status"
        );
        const tagsProp = properties.find(
          (p: { name: string }) => p.name === "Tags"
        );

        expect(nameProp).toBeDefined();
        expect(nameProp.type).toBe("title");
        expect(statusProp).toBeDefined();
        expect(statusProp.type).toBe("select");
        expect(tagsProp).toBeDefined();
        expect(tagsProp.type).toBe("multi_select");
      });
    });

    describe("Dynamic CRUD Operations", () => {
      it("should query database with filters and sorts", async () => {
        const response = await testApp(
          new Request("http://localhost/api/db/query", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              databaseId: testDatabaseId,
              filter: {
                property: "Status",
                select: { equals: "Draft" },
              },
              sorts: [
                {
                  property: "Views",
                  direction: "descending",
                },
              ],
              pageSize: 10,
            }),
          })
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.pages).toBeDefined();
        expect(Array.isArray(body.pages)).toBe(true);
        expect(body.hasMore).toBeDefined();
        expect(typeof body.hasMore).toBe("boolean");
        expect(body.nextCursor).toBeDefined();
      });

      it("should retrieve a specific page", async () => {
        const response = await testApp(
          new Request(`http://localhost/api/db/get?pageId=${testPageId}`)
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.page).toBeDefined();
        expect(body.page.id).toBe(testPageId);
        expect(body.page.properties).toBeDefined();

        // Verify the page has our test data
        const properties = body.page.properties;
        expect(properties.Name.title[0].text.content).toBe("Test Article");
        expect(properties.Status.select.name).toBe("Draft");
        expect(properties.Views.number).toBe(42);
        expect(properties.IsPublic.checkbox).toBe(true);
      });

      it("should create a new page", async () => {
        const response = await testApp(
          new Request("http://localhost/api/db/create", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              databaseId: testDatabaseId,
              properties: {
                Name: { title: [{ text: { content: "New Test Article" } }] },
                Status: { select: { name: "Published" } },
                Tags: { multi_select: [{ name: "news" }] },
                Views: { number: 100 },
                IsPublic: { checkbox: false },
                Priority: { status: { name: "High" } },
              },
            }),
          })
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.pageId).toBeDefined();
        expect(typeof body.pageId).toBe("string");
      });

      it("should update an existing page", async () => {
        const response = await testApp(
          new Request("http://localhost/api/db/update", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              pageId: testPageId,
              properties: {
                Views: { number: 150 },
                Status: { select: { name: "Published" } },
                Tags: {
                  multi_select: [
                    { name: "tech" },
                    { name: "news" },
                    { name: "announcement" },
                  ],
                },
              },
            }),
          })
        );

        expect(response.status).toBe(200);
        const body = await response.json();
        expect(body.pageId).toBe(testPageId);

        // Verify the update worked by retrieving the page
        const getResponse = await testApp(
          new Request(`http://localhost/api/db/get?pageId=${testPageId}`)
        );
        expect(getResponse.status).toBe(200);
        const getBody = await getResponse.json();
        expect(getBody.page.properties.Views.number).toBe(150);
        expect(getBody.page.properties.Status.select.name).toBe("Published");
        expect(getBody.page.properties.Tags.multi_select).toHaveLength(3);
      });
    });

    describe("Error Handling", () => {
      it("should handle non-existent database queries", async () => {
        const nonexistentDb = "00000000-0000-0000-0000-000000000000";
        const response = await testApp(
          new Request("http://localhost/api/db/query", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              databaseId: nonexistentDb,
            }),
          })
        );

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.code).toBe("NotFound");
      });

      it("should handle non-existent page retrieval", async () => {
        const nonexistentPage = "00000000-0000-0000-0000-000000000000";
        const response = await testApp(
          new Request(`http://localhost/api/db/get?pageId=${nonexistentPage}`)
        );

        expect(response.status).toBe(404);
        const body = await response.json();
        expect(body.code).toBe("NotFound");
      });

      it("should handle invalid property updates", async () => {
        const response = await testApp(
          new Request("http://localhost/api/db/update", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              pageId: testPageId,
              properties: {
                InvalidField: { invalid_type: "value" },
              },
            }),
          })
        );

        expect(response.status).toBe(400);
        const body = await response.json();
        expect(body.code).toBeDefined();
      });
    });

    describe("Schema Validation", () => {
      it("should validate that runtime schemas match codegen patterns", async () => {
        // This test verifies that our runtime schema builder produces
        // schemas that are compatible with the codegen approach

        const response = await testApp(
          new Request(
            `http://localhost/api/db/get-schema?databaseId=${testDatabaseId}`
          )
        );

        expect(response.status).toBe(200);
        const body = await response.json();

        // Verify select options are preserved
        const statusProp = body.properties.find(
          (p: { name: string }) => p.name === "Status"
        );
        expect(statusProp.config.select.options).toHaveLength(3);
        expect(
          statusProp.config.select.options.map((o: { name: string }) => o.name)
        ).toEqual(["Draft", "Published", "Archived"]);

        // Verify multi-select options are preserved
        const tagsProp = body.properties.find(
          (p: { name: string }) => p.name === "Tags"
        );
        expect(tagsProp.config.multi_select.options).toHaveLength(4);
        expect(
          tagsProp.config.multi_select.options.map(
            (o: { name: string }) => o.name
          )
        ).toEqual(["tech", "news", "tutorial", "announcement"]);

        // Verify formula type is preserved
        const scoreProp = body.properties.find(
          (p: { name: string }) => p.name === "Score"
        );
        expect(scoreProp.config.formula.type).toBe("number");
      });
    });
  }
);
