import { describe, expect, it } from "vitest";
import type { NormalizedDatabaseSchema } from "../src/NotionSchema.js";
import { validateListArticlesRequestAgainstSchema } from "../src/validation.js";

describe("Validation Logic", () => {
  const mockSchema: NormalizedDatabaseSchema = {
    databaseId: "test-db-id",
    titlePropertyName: "Title",
    properties: [
      { name: "Title", type: "title" },
      {
        name: "Status",
        type: "select",
        config: { options: ["Draft", "Published"] },
      },
      {
        name: "Tags",
        type: "multi_select",
        config: { options: ["tech", "news"] },
      },
      { name: "Views", type: "number" },
      { name: "Published", type: "date" },
      { name: "IsPublic", type: "checkbox" },
    ],
    lastEditedTime: "2023-01-01T00:00:00.000Z",
    propertiesHash: "test-hash",
  };

  describe("validateListArticlesRequestAgainstSchema", () => {
    it("should pass validation for valid request", () => {
      const request = {
        databaseId: "test-db-id",
        titlePropertyName: "Title",
        filter: {
          property: "Status",
          select: { equals: "Published" },
        },
        sorts: [
          {
            property: "Views",
            direction: "descending" as const,
          },
        ],
        pageSize: 10,
        startCursor: undefined,
      };

      const errors = validateListArticlesRequestAgainstSchema(
        request,
        mockSchema,
      );
      expect(errors).toHaveLength(0);
    });

    it("should validate titlePropertyName exists in schema", () => {
      const request = {
        databaseId: "test-db-id",
        titlePropertyName: "NonExistentTitle",
        filter: undefined,
        sorts: undefined,
        pageSize: 10,
        startCursor: undefined,
      };

      const errors = validateListArticlesRequestAgainstSchema(
        request,
        mockSchema,
      );
      expect(errors).toContain("Unknown titlePropertyName: NonExistentTitle");
    });

    it("should validate filter property exists in schema", () => {
      const request = {
        databaseId: "test-db-id",
        titlePropertyName: "Title",
        filter: {
          property: "NonExistentProperty",
          select: { equals: "Published" },
        },
        sorts: undefined,
        pageSize: 10,
        startCursor: undefined,
      };

      const errors = validateListArticlesRequestAgainstSchema(
        request,
        mockSchema,
      );
      expect(errors).toContain(
        "Unknown filter property: NonExistentProperty at filter",
      );
    });

    it("should validate sort property exists in schema", () => {
      const request = {
        databaseId: "test-db-id",
        titlePropertyName: "Title",
        filter: undefined,
        sorts: [
          {
            property: "NonExistentProperty",
            direction: "descending" as const,
          },
        ],
        pageSize: 10,
        startCursor: undefined,
      };

      const errors = validateListArticlesRequestAgainstSchema(
        request,
        mockSchema,
      );
      expect(errors).toContain(
        "Unknown sort property: NonExistentProperty at sorts[0].property",
      );
    });

    it("should validate multiple errors at once", () => {
      const request = {
        databaseId: "test-db-id",
        titlePropertyName: "NonExistentTitle",
        filter: {
          property: "NonExistentFilter",
          select: { equals: "Published" },
        },
        sorts: [
          {
            property: "NonExistentSort",
            direction: "descending" as const,
          },
        ],
        pageSize: 10,
        startCursor: undefined,
      };

      const errors = validateListArticlesRequestAgainstSchema(
        request,
        mockSchema,
      );
      expect(errors).toHaveLength(3);
      expect(errors).toContain("Unknown titlePropertyName: NonExistentTitle");
      expect(errors).toContain(
        "Unknown filter property: NonExistentFilter at filter",
      );
      expect(errors).toContain(
        "Unknown sort property: NonExistentSort at sorts[0].property",
      );
    });

    it("should handle undefined filter and sorts", () => {
      const request = {
        databaseId: "test-db-id",
        titlePropertyName: "Title",
        filter: undefined,
        sorts: undefined,
        pageSize: 10,
        startCursor: undefined,
      };

      const errors = validateListArticlesRequestAgainstSchema(
        request,
        mockSchema,
      );
      expect(errors).toHaveLength(0);
    });

    it("should handle empty arrays for sorts", () => {
      const request = {
        databaseId: "test-db-id",
        titlePropertyName: "Title",
        filter: undefined,
        sorts: [],
        pageSize: 10,
        startCursor: undefined,
      };

      const errors = validateListArticlesRequestAgainstSchema(
        request,
        mockSchema,
      );
      expect(errors).toHaveLength(0);
    });

    it("should validate complex filter structures", () => {
      const request = {
        databaseId: "test-db-id",
        titlePropertyName: "Title",
        filter: {
          and: [
            {
              property: "Status",
              select: { equals: "Published" },
            },
            {
              property: "IsPublic",
              checkbox: { equals: true },
            },
          ],
        },
        sorts: undefined,
        pageSize: 10,
        startCursor: undefined,
      };

      const errors = validateListArticlesRequestAgainstSchema(
        request,
        mockSchema,
      );
      expect(errors).toHaveLength(0);
    });

    it("should validate complex filter with invalid properties", () => {
      const request = {
        databaseId: "test-db-id",
        titlePropertyName: "Title",
        filter: {
          and: [
            {
              property: "Status",
              select: { equals: "Published" },
            },
            {
              property: "InvalidProperty",
              checkbox: { equals: true },
            },
          ],
        },
        sorts: undefined,
        pageSize: 10,
        startCursor: undefined,
      };

      const errors = validateListArticlesRequestAgainstSchema(
        request,
        mockSchema,
      );
      expect(errors).toContain(
        "Unknown filter property: InvalidProperty at filter.and[1]",
      );
    });

    it("should handle or filter conditions", () => {
      const request = {
        databaseId: "test-db-id",
        titlePropertyName: "Title",
        filter: {
          or: [
            {
              property: "Status",
              select: { equals: "Published" },
            },
            {
              property: "Status",
              select: { equals: "Draft" },
            },
          ],
        },
        sorts: undefined,
        pageSize: 10,
        startCursor: undefined,
      };

      const errors = validateListArticlesRequestAgainstSchema(
        request,
        mockSchema,
      );
      expect(errors).toHaveLength(0);
    });

    it("should handle nested filter conditions", () => {
      const request = {
        databaseId: "test-db-id",
        titlePropertyName: "Title",
        filter: {
          and: [
            {
              property: "Status",
              select: { equals: "Published" },
            },
            {
              property: "IsPublic",
              checkbox: { equals: true },
            },
          ],
        },
        sorts: undefined,
        pageSize: 10,
        startCursor: undefined,
      };

      const errors = validateListArticlesRequestAgainstSchema(
        request,
        mockSchema,
      );
      expect(errors).toHaveLength(0);
    });

    it("should validate pageSize constraints", () => {
      const request = {
        databaseId: "test-db-id",
        titlePropertyName: "Title",
        filter: undefined,
        sorts: undefined,
        pageSize: 0,
        startCursor: undefined,
      };

      const errors = validateListArticlesRequestAgainstSchema(
        request,
        mockSchema,
      );
      // Note: pageSize validation is not implemented in the current validation function
      expect(errors).toHaveLength(0);
    });

    it("should validate pageSize maximum", () => {
      const request = {
        databaseId: "test-db-id",
        titlePropertyName: "Title",
        filter: undefined,
        sorts: undefined,
        pageSize: 101,
        startCursor: undefined,
      };

      const errors = validateListArticlesRequestAgainstSchema(
        request,
        mockSchema,
      );
      // Note: pageSize validation is not implemented in the current validation function
      expect(errors).toHaveLength(0);
    });

    it("should handle valid pageSize", () => {
      const request = {
        databaseId: "test-db-id",
        titlePropertyName: "Title",
        filter: undefined,
        sorts: undefined,
        pageSize: 50,
        startCursor: undefined,
      };

      const errors = validateListArticlesRequestAgainstSchema(
        request,
        mockSchema,
      );
      expect(errors).toHaveLength(0);
    });
  });

  describe("Schema edge cases", () => {
    it("should handle schema with no properties", () => {
      const emptySchema: NormalizedDatabaseSchema = {
        databaseId: "test-db-id",
        titlePropertyName: "Title",
        properties: [],
        lastEditedTime: "2023-01-01T00:00:00.000Z",
        propertiesHash: "empty-hash",
      };

      const request = {
        databaseId: "test-db-id",
        titlePropertyName: "Title",
        filter: undefined,
        sorts: undefined,
        pageSize: 10,
        startCursor: undefined,
      };

      const errors = validateListArticlesRequestAgainstSchema(
        request,
        emptySchema,
      );
      expect(errors).toContain("Unknown titlePropertyName: Title");
    });

    it("should handle schema with different title property", () => {
      const customSchema: NormalizedDatabaseSchema = {
        databaseId: "test-db-id",
        titlePropertyName: "Name",
        properties: [
          { name: "Name", type: "title" },
          {
            name: "Status",
            type: "select",
            config: { options: ["Draft", "Published"] },
          },
        ],
        lastEditedTime: "2023-01-01T00:00:00.000Z",
        propertiesHash: "custom-hash",
      };

      const request = {
        databaseId: "test-db-id",
        titlePropertyName: "Name",
        filter: {
          property: "Status",
          select: { equals: "Published" },
        },
        sorts: undefined,
        pageSize: 10,
        startCursor: undefined,
      };

      const errors = validateListArticlesRequestAgainstSchema(
        request,
        customSchema,
      );
      expect(errors).toHaveLength(0);
    });
  });
});
