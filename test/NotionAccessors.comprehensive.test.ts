import { describe, expect, it } from "vitest";
import {
  getCheckbox,
  getDate,
  getFileUrls,
  getFormula,
  getMultiSelect,
  getNumber,
  getPeopleIds,
  getPropertyFromPage,
  getRelationIds,
  getRichText,
  getRollup,
  getSelect,
  getTitleFromPage,
  getUrl,
} from "../src/NotionAccessors.js";

describe("NotionAccessors Comprehensive Tests", () => {
  const mockPage = {
    object: "page" as const,
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
    },
  };

  const mockSchema = {
    databaseId: "test-db-id",
    titlePropertyName: "Title",
    properties: [
      { name: "Title", type: "title" },
      { name: "Status", type: "select" },
      { name: "Views", type: "number" },
      { name: "IsPublic", type: "checkbox" },
    ],
    lastEditedTime: "2023-01-01T00:00:00.000Z",
    propertiesHash: "test-hash",
  };

  describe("getTitleFromPage", () => {
    it("should extract title from page properties", () => {
      const result = getTitleFromPage(mockPage, mockSchema);
      expect(result).toBe("Test Article");
    });

    it("should handle empty title array", () => {
      const page = {
        ...mockPage,
        properties: {
          Title: { title: [] },
        },
      };

      const result = getTitleFromPage(page, mockSchema);
      expect(result).toBe("Untitled");
    });

    it("should handle missing title property", () => {
      const page = {
        ...mockPage,
        properties: {
          OtherProperty: { title: [{ text: { content: "Test" } }] },
        },
      };

      const result = getTitleFromPage(page, mockSchema);
      expect(result).toBe("Untitled");
    });

    it("should handle title with multiple text blocks", () => {
      const page = {
        ...mockPage,
        properties: {
          Title: {
            title: [
              {
                type: "text",
                text: { content: "Part 1" },
                plain_text: "Part 1",
              },
              {
                type: "text",
                text: { content: "Part 2" },
                plain_text: "Part 2",
              },
            ],
          },
        },
      };

      const result = getTitleFromPage(page, mockSchema);
      expect(result).toBe("Part 1");
    });
  });

  describe("getRichText", () => {
    it("should extract rich text content", () => {
      const result = getRichText(mockPage, "Title");
      expect(result).toBe("Test Article");
    });

    it("should handle empty rich text array", () => {
      const page = {
        ...mockPage,
        properties: {
          Description: { rich_text: [] },
        },
      };

      const result = getRichText(page, "Description");
      expect(result).toBe("");
    });

    it("should handle multiple rich text blocks", () => {
      const page = {
        ...mockPage,
        properties: {
          Description: {
            rich_text: [
              {
                type: "text",
                text: { content: "First block" },
                plain_text: "First block",
              },
              {
                type: "text",
                text: { content: "Second block" },
                plain_text: "Second block",
              },
            ],
          },
        },
      };

      const result = getRichText(page, "Description");
      expect(result).toBe("First blockSecond block");
    });
  });

  describe("getSelect", () => {
    it("should extract select option name", () => {
      const page = {
        ...mockPage,
        properties: {
          Status: {
            select: {
              id: "option-id",
              name: "Published",
              color: "green",
            },
          },
        },
      };

      const result = getSelect(page, "Status");
      expect(result).toBe("Published");
    });

    it("should handle null select", () => {
      const page = {
        ...mockPage,
        properties: {
          Status: { select: null },
        },
      };

      const result = getSelect(page, "Status");
      expect(result).toBeNull();
    });

    it("should handle missing select property", () => {
      const result = getSelect(mockPage, "NonExistent");
      expect(result).toBeNull();
    });
  });

  describe("getDate", () => {
    it("should extract date with start and end", () => {
      const page = {
        ...mockPage,
        properties: {
          Published: {
            date: {
              start: "2023-01-01T00:00:00.000Z",
              end: "2023-01-02T00:00:00.000Z",
            },
          },
        },
      };

      const result = getDate(page, "Published");
      expect(result).toEqual({
        start: "2023-01-01T00:00:00.000Z",
        end: "2023-01-02T00:00:00.000Z",
      });
    });

    it("should handle date with only start", () => {
      const page = {
        ...mockPage,
        properties: {
          Published: {
            date: {
              start: "2023-01-01T00:00:00.000Z",
            },
          },
        },
      };

      const result = getDate(page, "Published");
      expect(result).toEqual({
        start: "2023-01-01T00:00:00.000Z",
        end: null,
      });
    });

    it("should handle null date", () => {
      const page = {
        ...mockPage,
        properties: {
          Published: { date: null },
        },
      };

      const result = getDate(page, "Published");
      expect(result).toBeNull();
    });
  });

  describe("getNumber", () => {
    it("should extract number value", () => {
      const page = {
        ...mockPage,
        properties: {
          Views: { number: 42 },
        },
      };

      const result = getNumber(page, "Views");
      expect(result).toBe(42);
    });

    it("should handle null number", () => {
      const page = {
        ...mockPage,
        properties: {
          Views: { number: null },
        },
      };

      const result = getNumber(page, "Views");
      expect(result).toBeNull();
    });
  });

  describe("getCheckbox", () => {
    it("should extract checkbox value", () => {
      const page = {
        ...mockPage,
        properties: {
          IsPublic: { checkbox: true },
        },
      };

      const result = getCheckbox(page, "IsPublic");
      expect(result).toBe(true);
    });

    it("should handle false checkbox", () => {
      const page = {
        ...mockPage,
        properties: {
          IsPublic: { checkbox: false },
        },
      };

      const result = getCheckbox(page, "IsPublic");
      expect(result).toBe(false);
    });
  });

  describe("getUrl", () => {
    it("should extract URL", () => {
      const page = {
        ...mockPage,
        properties: {
          Link: { url: "https://example.com" },
        },
      };

      const result = getUrl(page, "Link");
      expect(result).toBe("https://example.com");
    });

    it("should handle null URL", () => {
      const page = {
        ...mockPage,
        properties: {
          Link: { url: null },
        },
      };

      const result = getUrl(page, "Link");
      expect(result).toBeNull();
    });
  });

  describe("getFileUrls", () => {
    it("should extract file URLs", () => {
      const page = {
        ...mockPage,
        properties: {
          Attachments: {
            files: [
              {
                name: "file1.pdf",
                type: "file",
                file: { url: "https://example.com/file1.pdf" },
              },
              {
                name: "file2.jpg",
                type: "external",
                external: { url: "https://example.com/file2.jpg" },
              },
            ],
          },
        },
      };

      const result = getFileUrls(page, "Attachments");
      expect(result).toEqual([
        "https://example.com/file1.pdf",
        "https://example.com/file2.jpg",
      ]);
    });

    it("should handle empty files array", () => {
      const page = {
        ...mockPage,
        properties: {
          Attachments: { files: [] },
        },
      };

      const result = getFileUrls(page, "Attachments");
      expect(result).toBeNull();
    });
  });

  describe("getPeopleIds", () => {
    it("should extract people IDs", () => {
      const page = {
        ...mockPage,
        properties: {
          Authors: {
            people: [
              { id: "user1", name: "User 1", avatar_url: null },
              { id: "user2", name: "User 2", avatar_url: null },
            ],
          },
        },
      };

      const result = getPeopleIds(page, "Authors");
      expect(result).toEqual(["user1", "user2"]);
    });

    it("should handle empty people array", () => {
      const page = {
        ...mockPage,
        properties: {
          Authors: { people: [] },
        },
      };

      const result = getPeopleIds(page, "Authors");
      expect(result).toBeNull();
    });
  });

  describe("getRelationIds", () => {
    it("should extract relation IDs", () => {
      const page = {
        ...mockPage,
        properties: {
          RelatedPages: {
            relation: [{ id: "page1" }, { id: "page2" }],
          },
        },
      };

      const result = getRelationIds(page, "RelatedPages");
      expect(result).toEqual(["page1", "page2"]);
    });

    it("should handle empty relation array", () => {
      const page = {
        ...mockPage,
        properties: {
          RelatedPages: { relation: [] },
        },
      };

      const result = getRelationIds(page, "RelatedPages");
      expect(result).toBeNull();
    });
  });

  describe("getMultiSelect", () => {
    it("should extract multi-select option names", () => {
      const page = {
        ...mockPage,
        properties: {
          Tags: {
            multi_select: [
              { id: "tag1", name: "Tech", color: "blue" },
              { id: "tag2", name: "News", color: "green" },
            ],
          },
        },
      };

      const result = getMultiSelect(page, "Tags");
      expect(result).toEqual(["Tech", "News"]);
    });

    it("should handle empty multi-select array", () => {
      const page = {
        ...mockPage,
        properties: {
          Tags: { multi_select: [] },
        },
      };

      const result = getMultiSelect(page, "Tags");
      expect(result).toBeNull();
    });
  });

  describe("getFormula", () => {
    it("should extract string formula result", () => {
      const page = {
        ...mockPage,
        properties: {
          Computed: {
            formula: {
              type: "string",
              string: "Formula result",
            },
          },
        },
      };

      const result = getFormula(page, "Computed");
      expect(result).toEqual({
        kind: "string",
        value: "Formula result",
      });
    });

    it("should extract number formula result", () => {
      const page = {
        ...mockPage,
        properties: {
          Computed: {
            formula: {
              type: "number",
              number: 42,
            },
          },
        },
      };

      const result = getFormula(page, "Computed");
      expect(result).toEqual({
        kind: "number",
        value: 42,
      });
    });

    it("should extract boolean formula result", () => {
      const page = {
        ...mockPage,
        properties: {
          Computed: {
            formula: {
              type: "boolean",
              boolean: true,
            },
          },
        },
      };

      const result = getFormula(page, "Computed");
      expect(result).toEqual({
        kind: "boolean",
        value: true,
      });
    });

    it("should extract date formula result", () => {
      const page = {
        ...mockPage,
        properties: {
          Computed: {
            formula: {
              type: "date",
              date: {
                start: "2023-01-01T00:00:00.000Z",
              },
            },
          },
        },
      };

      const result = getFormula(page, "Computed");
      expect(result).toEqual({
        kind: "date",
        value: {
          start: "2023-01-01T00:00:00.000Z",
          end: undefined,
        },
      });
    });
  });

  describe("getRollup", () => {
    it("should extract rollup array", () => {
      const page = {
        ...mockPage,
        properties: {
          Summary: {
            rollup: {
              type: "array",
              array: [
                { type: "number", number: 1 },
                { type: "number", number: 2 },
              ],
            },
          },
        },
      };

      const result = getRollup(page, "Summary");
      expect(result).toEqual({
        kind: "array",
        value: [
          { type: "number", number: 1 },
          { type: "number", number: 2 },
        ],
      });
    });

    it("should extract rollup number", () => {
      const page = {
        ...mockPage,
        properties: {
          Summary: {
            rollup: {
              type: "number",
              number: 42,
            },
          },
        },
      };

      const result = getRollup(page, "Summary");
      expect(result).toEqual({
        kind: "number",
        value: 42,
      });
    });

    it("should extract rollup date", () => {
      const page = {
        ...mockPage,
        properties: {
          Summary: {
            rollup: {
              type: "date",
              date: {
                start: "2023-01-01T00:00:00.000Z",
              },
            },
          },
        },
      };

      const result = getRollup(page, "Summary");
      expect(result).toEqual({
        kind: "date",
        value: {
          start: "2023-01-01T00:00:00.000Z",
          end: undefined,
        },
      });
    });
  });

  describe("getPropertyFromPage", () => {
    it("should extract title property", () => {
      const result = getPropertyFromPage(mockPage, mockSchema, "Title");
      expect(result).toEqual({
        type: "title",
        value: "Test Article",
      });
    });

    it("should extract select property", () => {
      const page = {
        ...mockPage,
        properties: {
          Status: {
            select: {
              id: "status-id",
              name: "Published",
              color: "green",
            },
          },
        },
      };

      const schema = {
        ...mockSchema,
        properties: [
          { name: "Title", type: "title" },
          { name: "Status", type: "select" },
        ],
      };

      const result = getPropertyFromPage(page, schema, "Status");
      expect(result).toEqual({
        type: "select",
        value: "Published",
      });
    });

    it("should extract number property", () => {
      const page = {
        ...mockPage,
        properties: {
          Views: { number: 42 },
        },
      };

      const schema = {
        ...mockSchema,
        properties: [
          { name: "Title", type: "title" },
          { name: "Views", type: "number" },
        ],
      };

      const result = getPropertyFromPage(page, schema, "Views");
      expect(result).toEqual({
        type: "number",
        value: 42,
      });
    });

    it("should handle missing property", () => {
      const result = getPropertyFromPage(
        mockPage,
        mockSchema,
        "MissingProperty"
      );
      expect(result).toEqual({
        type: "unknown",
        value: undefined,
      });
    });

    it("should handle unsupported property type", () => {
      const schema = {
        ...mockSchema,
        properties: [
          { name: "Title", type: "title" },
          { name: "Custom", type: "unsupported" },
        ],
      };

      const result = getPropertyFromPage(mockPage, schema, "Custom");
      expect(result).toEqual({
        type: "unsupported",
        value: undefined,
      });
    });
  });
});
