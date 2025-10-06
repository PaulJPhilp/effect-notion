/**
 * Test Configuration and Utilities
 *
 * This file provides configuration and utilities for the test suite,
 * including test categories, mock data, and common test helpers.
 */

export interface TestConfig {
  // Test categories
  categories: {
    unit: string[];
    integration: string[];
    e2e: string[];
    performance: string[];
  };

  // Test timeouts
  timeouts: {
    unit: number;
    integration: number;
    e2e: number;
    performance: number;
  };

  // Mock data
  mockData: {
    notionPage: Record<string, unknown>;
    notionDatabase: Record<string, unknown>;
    notionBlock: Record<string, unknown>;
  };
}

export const testConfig: TestConfig = {
  categories: {
    unit: [
      "validation.comprehensive.test.ts",
      "NotionAccessors.comprehensive.test.ts",
      "resilience.comprehensive.test.ts",
      "Codecs.helpers.test.ts",
      "Errors.pretty.test.ts",
      "Config.annotations.test.ts",
    ],
    integration: [
      "api.integration.test.ts",
      "api.failure.integration.test.ts",
      "articles.router.integration.test.ts",
      "articles.router.crud.integration.test.ts",
      "dynamic.tables.integration.test.ts",
      "NotionClient.integration.test.ts",
      "NotionService.integration.test.ts",
    ],
    e2e: ["server.test.ts", "smoke.test.ts"],
    performance: ["metrics.endpoint.test.ts", "simple.metrics.test.ts"],
  },
  timeouts: {
    unit: 5000,
    integration: 30000,
    e2e: 60000,
    performance: 10000,
  },
  mockData: {
    notionPage: {
      id: "test-page-id",
      properties: {
        Title: {
          title: [
            {
              type: "text",
              text: { content: "Test Article" },
              plain_text: "Test Article",
            },
          ],
        },
        Status: {
          select: {
            id: "status-id",
            name: "Published",
            color: "green",
          },
        },
        Views: { number: 42 },
        IsPublic: { checkbox: true },
      },
    },
    notionDatabase: {
      id: "test-db-id",
      title: [{ text: { content: "Test Database" } }],
      properties: {
        Title: { type: "title" },
        Status: { type: "select", options: ["Draft", "Published"] },
        Views: { type: "number" },
        IsPublic: { type: "checkbox" },
      },
    },
    notionBlock: {
      id: "test-block-id",
      type: "paragraph",
      paragraph: {
        rich_text: [
          {
            type: "text",
            text: { content: "Test paragraph content" },
            plain_text: "Test paragraph content",
          },
        ],
      },
    },
  },
};

/**
 * Test utilities
 */
export const testUtils = {
  /**
   * Create a mock Notion page with custom properties
   */
  createMockPage: (properties: Record<string, unknown> = {}) => ({
    id: "mock-page-id",
    properties: {
      Title: {
        title: [
          {
            type: "text",
            text: { content: "Mock Article" },
            plain_text: "Mock Article",
          },
        ],
      },
      ...properties,
    },
  }),

  /**
   * Create a mock Notion database with custom properties
   */
  createMockDatabase: (properties: Record<string, unknown> = {}) => ({
    id: "mock-db-id",
    title: [{ text: { content: "Mock Database" } }],
    properties: {
      Title: { type: "title" },
      ...properties,
    },
  }),

  /**
   * Wait for a specified amount of time
   */
  wait: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),

  /**
   * Retry a function with exponential backoff
   */
  retry: async <T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
    baseDelay = 100
  ): Promise<T> => {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (attempt === maxAttempts) {
          throw lastError;
        }
        await testUtils.wait(baseDelay * 2 ** (attempt - 1));
      }
    }

    throw lastError || new Error("Retry failed");
  },

  /**
   * Check if running in CI environment
   */
  isCI: () => Boolean(process.env.CI),

  /**
   * Check if required environment variables are set
   */
  hasRequiredEnv: () => {
    const required = ["NOTION_API_KEY"];
    return required.every((key) => Boolean(process.env[key]));
  },
};

/**
 * Test categories for filtering
 */
export const testCategories = {
  /**
   * Skip tests that require external services
   */
  skipExternal: (reason = "External service not available") => {
    if (!testUtils.hasRequiredEnv()) {
      console.log(`Skipping test: ${reason}`);
      return true;
    }
    return false;
  },

  /**
   * Skip tests in CI environment
   */
  skipCI: (reason = "Not suitable for CI") => {
    if (testUtils.isCI()) {
      console.log(`Skipping test in CI: ${reason}`);
      return true;
    }
    return false;
  },

  /**
   * Mark test as slow
   */
  slow: (timeout = 30000) => {
    return { timeout };
  },
};

export default testConfig;
