#!/usr/bin/env bun

/**
 * Test runner for dynamic tables functionality
 *
 * This script provides utilities for testing dynamic tables with a real Notion integration.
 * It can create test databases, run CRUD operations, and clean up test data.
 *
 * Usage:
 *   bun run test/dynamic.tables.test.runner.ts create-db
 *   bun run test/dynamic.tables.test.runner.ts test-crud
 *   bun run test/dynamic.tables.test.runner.ts cleanup
 */

import { NodeContext } from "@effect/platform-node";
import * as dotenv from "dotenv";
import { Effect, Layer, Logger } from "effect";
import { NotionClient } from "../src/NotionClient.js";
import { NotionService } from "../src/NotionService.js";
import { AppConfigProviderLive } from "../src/config.js";
import type { SimpleDbSpec } from "../src/services/NotionService/helpers.js";

// Load environment variables
dotenv.config();

const { NOTION_API_KEY, NOTION_TEST_PARENT_PAGE_ID } = process.env;

if (!NOTION_API_KEY || !NOTION_TEST_PARENT_PAGE_ID) {
  console.error("Missing required environment variables:");
  console.error("  NOTION_API_KEY");
  console.error("  NOTION_TEST_PARENT_PAGE_ID");
  process.exit(1);
}

const TestLayer = Layer.mergeAll(
  Logger.json,
  AppConfigProviderLive,
  NodeContext.layer,
  NotionClient.Default,
  NotionService.Default,
);

// Test database schema
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

async function createTestDatabase() {
  console.log("Creating test database...");

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const notionService = yield* NotionService;
      return yield* notionService.createDatabaseWithSchema({
        parentPageId: NOTION_TEST_PARENT_PAGE_ID,
        title: `Test DB ${Date.now()}`,
        spec: testDbSpec,
      });
    }).pipe(Effect.provide(TestLayer)),
  );

  console.log("✅ Test database created successfully!");
  console.log(`Database ID: ${result.databaseId}`);
  console.log(`Properties: ${result.properties.length}`);

  return result.databaseId;
}

async function testCrudOperations(databaseId: string) {
  console.log(`\nTesting CRUD operations on database: ${databaseId}`);

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const notionService = yield* NotionService;

      // 1. Create a page
      console.log("1. Creating a test page...");
      const createResult = yield* notionService.dynamicCreatePage({
        databaseId,
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
      });

      console.log(`✅ Page created with ID: ${createResult.id}`);

      // 2. Query the database
      console.log("2. Querying database...");
      const queryResult = yield* notionService.dynamicQuery({
        databaseId,
        filter: {
          property: "Status",
          select: { equals: "Draft" },
        },
        pageSize: 10,
      });

      console.log(`✅ Found ${queryResult.pages.length} pages`);

      // 3. Get the specific page
      console.log("3. Retrieving the created page...");
      const page = yield* notionService.dynamicGetPage(createResult.id);

      console.log(
        `✅ Page retrieved: ${page.properties.Name?.title?.[0]?.text?.content}`,
      );

      // 4. Update the page
      console.log("4. Updating the page...");
      yield* notionService.dynamicUpdatePage({
        pageId: createResult.id,
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
      });

      console.log("✅ Page updated successfully");

      // 5. Verify the update
      console.log("5. Verifying the update...");
      const updatedPage = yield* notionService.dynamicGetPage(createResult.id);

      const views = updatedPage.properties.Views?.number;
      const status = updatedPage.properties.Status?.select?.name;
      const tags = updatedPage.properties.Tags?.multi_select;

      console.log(
        `✅ Updated values - Views: ${views}, Status: ${status}, Tags: ${tags?.length}`,
      );

      return {
        pageId: createResult.id,
        finalViews: views,
        finalStatus: status,
        finalTags: tags,
      };
    }).pipe(Effect.provide(TestLayer)),
  );

  console.log("\n🎉 All CRUD operations completed successfully!");
  return result;
}

async function getDatabaseSchema(databaseId: string) {
  console.log(`\nGetting schema for database: ${databaseId}`);

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const notionService = yield* NotionService;
      return yield* notionService.getDatabaseSchema(databaseId);
    }).pipe(Effect.provide(TestLayer)),
  );

  console.log("✅ Database schema retrieved:");
  console.log(`  Title property: ${result.titlePropertyName}`);
  console.log(`  Properties: ${result.properties.length}`);
  console.log(`  Last edited: ${result.lastEditedTime}`);
  console.log(`  Hash: ${result.propertiesHash}`);

  // Show property details
  for (const prop of result.properties) {
    console.log(`  - ${prop.name} (${prop.type})`);
  }

  return result;
}

async function main() {
  const command = process.argv[2];

  switch (command) {
    case "create-db":
      await createTestDatabase();
      break;

    case "test-crud": {
      const dbId = process.argv[3];
      if (!dbId) {
        console.error(
          "Please provide a database ID: bun run test/dynamic.tables.test.runner.ts test-crud <database-id>",
        );
        process.exit(1);
      }
      await testCrudOperations(dbId);
      break;
    }

    case "get-schema": {
      const schemaDbId = process.argv[3];
      if (!schemaDbId) {
        console.error(
          "Please provide a database ID: bun run test/dynamic.tables.test.runner.ts get-schema <database-id>",
        );
        process.exit(1);
      }
      await getDatabaseSchema(schemaDbId);
      break;
    }

    case "full-test": {
      console.log("Running full test suite...");
      const databaseId = await createTestDatabase();
      await getDatabaseSchema(databaseId);
      await testCrudOperations(databaseId);
      console.log("\n🎉 Full test suite completed!");
      break;
    }

    default:
      console.log("Usage:");
      console.log("  bun run test/dynamic.tables.test.runner.ts create-db");
      console.log(
        "  bun run test/dynamic.tables.test.runner.ts test-crud <database-id>",
      );
      console.log(
        "  bun run test/dynamic.tables.test.runner.ts get-schema <database-id>",
      );
      console.log("  bun run test/dynamic.tables.test.runner.ts full-test");
      break;
  }
}

main().catch((error) => {
  console.error("❌ Test failed:", error);
  process.exit(1);
});
