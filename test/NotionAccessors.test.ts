import { describe, expect, it } from "vitest";
import {
  getDate,
  getNumber,
  getPropertyFromPage,
  getRichText,
  getSelect,
  getTitleFromPage,
} from "../src/NotionAccessors.js";
import type { NormalizedDatabaseSchema } from "../src/NotionSchema.js";

const schema: NormalizedDatabaseSchema = {
  databaseId: "db1",
  titlePropertyName: "Name",
  properties: [
    { name: "Name", type: "title" },
    { name: "Desc", type: "rich_text" },
    { name: "Category", type: "select" },
    { name: "Published", type: "date" },
    { name: "Views", type: "number" },
  ],
  lastEditedTime: "2025-01-01T00:00:00.000Z",
  propertiesHash: "deadbeef",
};

const page = {
  object: "page",
  id: "p1",
  properties: {
    Name: { title: [{ plain_text: "Hello" }] },
    Desc: { rich_text: [{ plain_text: "World" }] },
    Category: { select: { name: "News" } },
    Published: { date: { start: "2025-01-01", end: null } },
    Views: { number: 42 },
  },
};

describe("NotionAccessors", () => {
  it("getTitleFromPage returns title", () => {
    expect(getTitleFromPage(page, schema)).toBe("Hello");
  });

  it("getRichText extracts concatenated plain_text", () => {
    expect(getRichText(page, "Desc")).toBe("World");
  });

  it("getSelect returns option name", () => {
    expect(getSelect(page, "Category")).toBe("News");
  });

  it("getDate returns start/end", () => {
    expect(getDate(page, "Published")).toEqual({
      start: "2025-01-01",
      end: null,
      timezone: undefined,
    });
  });

  it("getNumber returns numeric value", () => {
    expect(getNumber(page, "Views")).toBe(42);
  });

  it("getPropertyFromPage returns discriminated values", () => {
    expect(getPropertyFromPage(page, schema, "Name")).toEqual({
      type: "title",
      value: "Hello",
    });
    expect(getPropertyFromPage(page, schema, "Desc")).toEqual({
      type: "rich_text",
      value: "World",
    });
    expect(getPropertyFromPage(page, schema, "Category")).toEqual({
      type: "select",
      value: "News",
    });
    expect(getPropertyFromPage(page, schema, "Published")).toEqual({
      type: "date",
      value: { start: "2025-01-01", end: null, timezone: undefined },
    });
    expect(getPropertyFromPage(page, schema, "Views")).toEqual({
      type: "number",
      value: 42,
    });
  });
});
