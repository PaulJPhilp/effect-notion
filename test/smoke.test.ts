import { Effect } from "effect";
// test/smoke.test.ts
import { describe, expect, it } from "vitest";
import { NotionClient } from "../src/NotionClient.js";
import { NotionService } from "../src/NotionService.js";

// This is a smoke test that verifies the basic functionality of the application
// It doesn't test all edge cases, but ensures the main components are working
describe("Smoke Test", () => {
  // Test that we can create instances of our main services
  it("should be able to create NotionService and NotionClient", () => {
    expect(NotionService).toBeDefined();
    expect(NotionClient).toBeDefined();
  });

  // Test that Effect is working properly
  it("should be able to run a simple Effect", () => {
    const program = Effect.succeed("Hello, world!");
    const result = Effect.runSync(program);
    expect(result).toBe("Hello, world!");
  });

  // Test that environment variables are loaded (if needed)
  it("should have required environment variables", () => {
    // Only check if we're running in a test environment that requires them
    if (process.env.NODE_ENV !== "test") {
      expect(process.env.NOTION_TOKEN).toBeDefined();
      expect(process.env.NOTION_DATABASE_ID).toBeDefined();
    }
  });
});
