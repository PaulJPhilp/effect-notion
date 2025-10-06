import * as S from "effect/Schema";
import { describe, expect, it } from "vitest";
import type { SimpleDbSpec } from "../src/services/NotionService/helpers.js";
import {
  buildNotionPropertiesFromSimpleSpec,
  buildRuntimeEffectSchema,
} from "../src/services/NotionService/helpers.js";

describe("Dynamic Schema Builder", () => {
  describe("buildNotionPropertiesFromSimpleSpec", () => {
    it("should build basic property types correctly", () => {
      const spec: SimpleDbSpec = {
        Name: { type: "title" },
        Content: { type: "rich_text" },
        Views: { type: "number" },
        IsPublished: { type: "checkbox" },
        PublishedAt: { type: "date" },
        Url: { type: "url" },
        Email: { type: "email" },
        Files: { type: "files" },
        Authors: { type: "people" },
        Related: { type: "relation" },
      };

      const properties = buildNotionPropertiesFromSimpleSpec(spec);

      expect(properties.Name).toEqual({ title: {} });
      expect(properties.Content).toEqual({ rich_text: {} });
      expect(properties.Views).toEqual({ number: {} });
      expect(properties.IsPublished).toEqual({ checkbox: {} });
      expect(properties.PublishedAt).toEqual({ date: {} });
      expect(properties.Url).toEqual({ url: {} });
      expect(properties.Email).toEqual({ email: {} });
      expect(properties.Files).toEqual({ files: {} });
      expect(properties.Authors).toEqual({ people: {} });
      expect(properties.Related).toEqual({
        relation: { database_id: "", single_property: {} },
      });
    });

    it("should build select properties with options", () => {
      const spec: SimpleDbSpec = {
        Status: {
          type: "select",
          options: ["Draft", "Published", "Archived"],
        },
        Priority: {
          type: "status",
          options: ["Low", "Medium", "High"],
        },
      };

      const properties = buildNotionPropertiesFromSimpleSpec(spec);

      expect(properties.Status).toEqual({
        select: {
          options: [
            { name: "Draft" },
            { name: "Published" },
            { name: "Archived" },
          ],
        },
      });

      expect(properties.Priority).toEqual({
        status: {
          options: [{ name: "Low" }, { name: "Medium" }, { name: "High" }],
        },
      });
    });

    it("should build multi_select properties with options", () => {
      const spec: SimpleDbSpec = {
        Tags: {
          type: "multi_select",
          options: ["tech", "news", "tutorial"],
        },
      };

      const properties = buildNotionPropertiesFromSimpleSpec(spec);

      expect(properties.Tags).toEqual({
        multi_select: {
          options: [{ name: "tech" }, { name: "news" }, { name: "tutorial" }],
        },
      });
    });

    it("should build formula properties with type", () => {
      const spec: SimpleDbSpec = {
        Score: { type: "formula", formulaType: "number" },
        IsActive: { type: "formula", formulaType: "boolean" },
        DisplayName: { type: "formula", formulaType: "string" },
        LastUpdated: { type: "formula", formulaType: "date" },
      };

      const properties = buildNotionPropertiesFromSimpleSpec(spec);

      expect(properties.Score).toEqual({
        formula: {
          expression: "",
          type: "number",
        },
      });

      expect(properties.IsActive).toEqual({
        formula: {
          expression: "",
          type: "boolean",
        },
      });

      expect(properties.DisplayName).toEqual({
        formula: {
          expression: "",
          type: "string",
        },
      });

      expect(properties.LastUpdated).toEqual({
        formula: {
          expression: "",
          type: "date",
        },
      });
    });

    it("should handle empty options arrays", () => {
      const spec: SimpleDbSpec = {
        Status: { type: "select" },
        Tags: { type: "multi_select" },
        Priority: { type: "status" },
      };

      const properties = buildNotionPropertiesFromSimpleSpec(spec);

      expect(properties.Status).toEqual({
        select: { options: [] },
      });

      expect(properties.Tags).toEqual({
        multi_select: { options: [] },
      });

      expect(properties.Priority).toEqual({
        status: { options: [] },
      });
    });
  });

  describe("buildRuntimeEffectSchema", () => {
    it("should build Effect schemas for primitive types", () => {
      const normalizedSchema = {
        databaseId: "test-db",
        titlePropertyName: "Name",
        properties: [
          { name: "Name", type: "title", config: {} },
          { name: "Content", type: "rich_text", config: {} },
          { name: "Views", type: "number", config: {} },
          { name: "IsPublished", type: "checkbox", config: {} },
          { name: "PublishedAt", type: "date", config: {} },
          { name: "Url", type: "url", config: {} },
        ],
        lastEditedTime: "2025-01-01T00:00:00.000Z",
        propertiesHash: "hash",
      };

      const result = buildRuntimeEffectSchema(normalizedSchema);

      expect(result.struct).toBeDefined();

      // Test that the schema can validate data
      const validData = {
        Name: "Test Article",
        Content: "Some content",
        Views: 42,
        IsPublished: true,
        PublishedAt: new Date("2025-01-15"),
        Url: "https://example.com",
      };

      const validation = S.decodeEither(result.struct)(validData);
      expect(validation._tag).toBe("Right");
    });

    it("should build Effect schemas with literal unions for select", () => {
      const normalizedSchema = {
        databaseId: "test-db",
        titlePropertyName: "Name",
        properties: [
          { name: "Name", type: "title", config: {} },
          {
            name: "Status",
            type: "select",
            config: {
              select: {
                options: [
                  { name: "Draft" },
                  { name: "Published" },
                  { name: "Archived" },
                ],
              },
            },
          },
        ],
        lastEditedTime: "2025-01-01T00:00:00.000Z",
        propertiesHash: "hash",
      };

      const result = buildRuntimeEffectSchema(normalizedSchema);

      // Test valid select value
      const validData = {
        Name: "Test Article",
        Status: "Draft",
      };

      const validValidation = S.decodeEither(result.struct)(validData);
      expect(validValidation._tag).toBe("Right");

      // Test invalid select value
      const invalidData = {
        Name: "Test Article",
        Status: "InvalidStatus",
      };

      const invalidValidation = S.decodeEither(result.struct)(invalidData);
      expect(invalidValidation._tag).toBe("Left");
    });

    it("should build Effect schemas with literal unions for multi_select", () => {
      const normalizedSchema = {
        databaseId: "test-db",
        titlePropertyName: "Name",
        properties: [
          { name: "Name", type: "title", config: {} },
          {
            name: "Tags",
            type: "multi_select",
            config: {
              multi_select: {
                options: [
                  { name: "tech" },
                  { name: "news" },
                  { name: "tutorial" },
                ],
              },
            },
          },
        ],
        lastEditedTime: "2025-01-01T00:00:00.000Z",
        propertiesHash: "hash",
      };

      const result = buildRuntimeEffectSchema(normalizedSchema);

      // Test valid multi_select values
      const validData = {
        Name: "Test Article",
        Tags: ["tech", "tutorial"],
      };

      const validValidation = S.decodeEither(result.struct)(validData);
      expect(validValidation._tag).toBe("Right");

      // Test invalid multi_select value
      const invalidData = {
        Name: "Test Article",
        Tags: ["tech", "invalid_tag"],
      };

      const invalidValidation = S.decodeEither(result.struct)(invalidData);
      expect(invalidValidation._tag).toBe("Left");
    });

    it("should build Effect schemas for formula types", () => {
      const normalizedSchema = {
        databaseId: "test-db",
        titlePropertyName: "Name",
        properties: [
          { name: "Name", type: "title", config: {} },
          {
            name: "Score",
            type: "formula",
            config: {
              formula: { type: "number" },
            },
          },
          {
            name: "IsActive",
            type: "formula",
            config: {
              formula: { type: "boolean" },
            },
          },
          {
            name: "DisplayName",
            type: "formula",
            config: {
              formula: { type: "string" },
            },
          },
          {
            name: "LastUpdated",
            type: "formula",
            config: {
              formula: { type: "date" },
            },
          },
        ],
        lastEditedTime: "2025-01-01T00:00:00.000Z",
        propertiesHash: "hash",
      };

      const result = buildRuntimeEffectSchema(normalizedSchema);

      const validData = {
        Name: "Test Article",
        Score: 42,
        IsActive: true,
        DisplayName: "Test",
        LastUpdated: new Date("2025-01-15"),
      };

      const validation = S.decodeEither(result.struct)(validData);
      expect(validation._tag).toBe("Right");
    });

    it("should handle unknown property types gracefully", () => {
      const normalizedSchema = {
        databaseId: "test-db",
        titlePropertyName: "Name",
        properties: [
          { name: "Name", type: "title", config: {} },
          { name: "UnknownField", type: "unknown_type", config: {} },
        ],
        lastEditedTime: "2025-01-01T00:00:00.000Z",
        propertiesHash: "hash",
      };

      const result = buildRuntimeEffectSchema(normalizedSchema);

      const validData = {
        Name: "Test Article",
        UnknownField: "any value",
      };

      const validation = S.decodeEither(result.struct)(validData);
      expect(validation._tag).toBe("Right");
    });

    it("should handle select properties with no options", () => {
      const normalizedSchema = {
        databaseId: "test-db",
        titlePropertyName: "Name",
        properties: [
          { name: "Name", type: "title", config: {} },
          {
            name: "Status",
            type: "select",
            config: {
              select: { options: [] },
            },
          },
        ],
        lastEditedTime: "2025-01-01T00:00:00.000Z",
        propertiesHash: "hash",
      };

      const result = buildRuntimeEffectSchema(normalizedSchema);

      // Should accept any string or undefined
      const validData1 = {
        Name: "Test Article",
        Status: "AnyString",
      };

      const validData2 = {
        Name: "Test Article",
        Status: undefined,
      };

      const validation1 = S.decodeEither(result.struct)(validData1);
      const validation2 = S.decodeEither(result.struct)(validData2);

      expect(validation1._tag).toBe("Right");
      expect(validation2._tag).toBe("Right");
    });

    it("should handle multi_select properties with no options", () => {
      const normalizedSchema = {
        databaseId: "test-db",
        titlePropertyName: "Name",
        properties: [
          { name: "Name", type: "title", config: {} },
          {
            name: "Tags",
            type: "multi_select",
            config: {
              multi_select: { options: [] },
            },
          },
        ],
        lastEditedTime: "2025-01-01T00:00:00.000Z",
        propertiesHash: "hash",
      };

      const result = buildRuntimeEffectSchema(normalizedSchema);

      // Should accept any array of strings
      const validData = {
        Name: "Test Article",
        Tags: ["any", "strings"],
      };

      const validation = S.decodeEither(result.struct)(validData);
      expect(validation._tag).toBe("Right");
    });

    it("should handle formula properties with unknown type", () => {
      const normalizedSchema = {
        databaseId: "test-db",
        titlePropertyName: "Name",
        properties: [
          { name: "Name", type: "title", config: {} },
          {
            name: "UnknownFormula",
            type: "formula",
            config: {
              formula: { type: "unknown" },
            },
          },
        ],
        lastEditedTime: "2025-01-01T00:00:00.000Z",
        propertiesHash: "hash",
      };

      const result = buildRuntimeEffectSchema(normalizedSchema);

      const validData = {
        Name: "Test Article",
        UnknownFormula: "any value",
      };

      const validation = S.decodeEither(result.struct)(validData);
      expect(validation._tag).toBe("Right");
    });

    it("should handle missing config for properties", () => {
      const normalizedSchema = {
        databaseId: "test-db",
        titlePropertyName: "Name",
        properties: [
          { name: "Name", type: "title", config: {} },
          {
            name: "Status",
            type: "select",
            config: undefined,
          },
          {
            name: "Tags",
            type: "multi_select",
            config: null,
          },
        ],
        lastEditedTime: "2025-01-01T00:00:00.000Z",
        propertiesHash: "hash",
      };

      const result = buildRuntimeEffectSchema(normalizedSchema);

      const validData = {
        Name: "Test Article",
        Status: "AnyString",
        Tags: ["any", "strings"],
      };

      const validation = S.decodeEither(result.struct)(validData);
      expect(validation._tag).toBe("Right");
    });
  });
});
