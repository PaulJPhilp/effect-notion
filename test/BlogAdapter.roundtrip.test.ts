import { describe, expect, it } from "vitest";
import { blogArticleAdapter } from "../src/domain/adapters/articles/blog.adapter";

// Round-trip tests for blog.adapter encode/decode mapping

describe("blog.adapter round-trip", () => {
  it("toNotionProperties encodes only provided keys with correct shapes", () => {
    const published = new Date("2024-01-02T03:04:05.000Z");

    const patch = {
      name: "Hello",
      description: "Desc",
      type: "Article",
      tags: ["Effect", "TS"],
      status: "Published",
      publishedAt: published,
    } satisfies Partial<import("../src/domain/logical/Common").BaseEntity>;

    const props = blogArticleAdapter.toNotionProperties({ patch });

    // Expect Notion property names exist and basic shape keys are present
    expect(Object.keys(props).sort()).toEqual(
      [
        "Title",
        "Description",
        "Content Type",
        "Tags",
        "Status",
        "Published Date",
      ].sort()
    );

    // Spot check shapes
    expect(props.Title.title[0].text.content).toBe("Hello");
    expect(props.Description.rich_text[0].text.content).toBe("Desc");
    expect(props["Content Type"].select?.name).toBe("Article");
    expect(
      props.Tags.multi_select.map((o: { name: string }) => o.name)
    ).toEqual(["Effect", "TS"]);
    expect(props.Status.select?.name).toBe("Published");
    expect(props["Published Date"].date?.start).toBe(
      "2024-01-02T03:04:05.000Z"
    );
  });

  it("fromNotionPage: collects warnings when a property fails to decode", () => {
    // Start from a valid props object using toNotionProperties
    const published = new Date("2024-05-06T07:08:09.000Z");
    const patch = {
      name: "Warn Test",
      description: "Desc",
      type: "Article",
      tags: ["one", "two"],
      status: "Draft",
      publishedAt: published,
    } satisfies Partial<import("../src/domain/logical/Common").BaseEntity>;

    const props = blogArticleAdapter.toNotionProperties({ patch });

    // Corrupt a single property to trigger a parse error while others remain valid
    // For example: make Content Type invalid (select name should be string)
    (props as Record<string, { select?: { name: unknown } }>)[
      "Content Type"
    ].select = { name: 123 };

    const page = {
      id: "page_warn",
      created_time: "2024-01-01T00:00:00.000Z",
      last_edited_time: "2024-01-02T00:00:00.000Z",
      created_by: { id: "u1", name: "Alice" },
      last_edited_by: { id: "u2", name: "Bob" },
      properties: props,
    } as {
      id: string;
      created_time: string;
      last_edited_time: string;
      created_by: { id: string; name: string };
      last_edited_by: { id: string; name: string };
      properties: Record<string, unknown>;
    };

    const entity = blogArticleAdapter.fromNotionPage({
      source: "blog",
      databaseId: "db_warn",
      page,
    }) as import("../src/domain/logical/Common").BaseEntity & {
      warnings?: ReadonlyArray<string>;
    };

    // Valid fields should still decode
    expect(entity.name).toBe("Warn Test");
    expect(entity.description).toBe("Desc");
    expect(entity.tags).toEqual(["one", "two"]);
    expect(entity.status).toBe("Draft");
    expect(entity.publishedAt?.toISOString()).toBe("2024-05-06T07:08:09.000Z");

    // Invalid field should be omitted and warning collected
    expect(entity.type).toBeUndefined();
    expect(Array.isArray(entity.warnings)).toBe(true);
    expect((entity.warnings ?? []).length).toBeGreaterThan(0);
    expect(
      (entity.warnings ?? []).some((w) => w.includes("Content Type"))
    ).toBe(true);
  });

  it("fromNotionPage decodes fields encoded by toNotionProperties", () => {
    const published = new Date("2024-02-03T04:05:06.000Z");

    const patch = {
      name: "World",
      description: "Body",
      type: "Note",
      tags: ["A", "B"],
      status: "Draft",
      publishedAt: published,
    } satisfies Partial<import("../src/domain/logical/Common").BaseEntity>;

    const props = blogArticleAdapter.toNotionProperties({ patch });

    const page = {
      id: "page_123",
      created_time: "2024-01-01T00:00:00.000Z",
      last_edited_time: "2024-01-02T00:00:00.000Z",
      created_by: { id: "u1", name: "Alice" },
      last_edited_by: { id: "u2", name: "Bob" },
      properties: props,
    } as {
      id: string;
      created_time: string;
      last_edited_time: string;
      created_by: { id: string; name: string };
      last_edited_by: { id: string; name: string };
      properties: Record<string, unknown>;
    };

    const entity = blogArticleAdapter.fromNotionPage({
      source: "blog",
      databaseId: "db_1",
      page,
    });

    expect(entity.name).toBe("World");
    expect(entity.description).toBe("Body");
    expect(entity.type).toBe("Note");
    expect(entity.tags).toEqual(["A", "B"]);
    expect(entity.status).toBe("Draft");
    expect(entity.publishedAt?.toISOString()).toBe("2024-02-03T04:05:06.000Z");

    // also check system fields were set
    expect(entity.pageId).toBe("page_123");
    expect(entity.source).toBe("blog");
    expect(entity.databaseId).toBe("db_1");
    expect(entity.createdAt instanceof Date).toBe(true);
    expect(entity.updatedAt instanceof Date).toBe(true);
    expect(typeof entity.createdBy === "string").toBe(true);
    expect(typeof entity.updatedBy === "string").toBe(true);
  });

  it("toNotionProperties: empty arrays and undefineds", () => {
    const patch = {
      // undefined fields should not be emitted
      description: undefined,
      type: undefined,
      status: undefined,
      publishedAt: undefined,
      // empty array should encode to empty multi_select
      tags: [],
    } satisfies Partial<import("../src/domain/logical/Common").BaseEntity>;

    const props = blogArticleAdapter.toNotionProperties({ patch });
    // Only Tags should be present
    expect(Object.keys(props)).toEqual(["Tags"]);
    expect(Array.isArray(props.Tags.multi_select)).toBe(true);
    expect(props.Tags.multi_select.length).toBe(0);
  });

  it("fromNotionPage: missing/partial properties handled", () => {
    const page = {
      id: "page_missing",
      created_time: "2024-01-01T00:00:00.000Z",
      last_edited_time: "2024-01-02T00:00:00.000Z",
      created_by: { id: "u1" },
      last_edited_by: { id: "u2" },
      properties: {
        // Only Tags present, and empty
        Tags: { multi_select: [] },
        // Deliberately omit Title, Description, Content Type, Status,
        // Published Date to simulate partial/missing properties
      },
    } as {
      id: string;
      created_time: string;
      last_edited_time: string;
      created_by: { id: string; name: string };
      last_edited_by: { id: string; name: string };
      properties: Record<string, unknown>;
    };

    const entity = blogArticleAdapter.fromNotionPage({
      source: "blog",
      databaseId: "db_x",
      page,
    });

    expect(entity.name).toBeUndefined();
    expect(entity.description).toBeUndefined();
    expect(entity.type).toBeUndefined();
    expect(entity.status).toBeUndefined();
    expect(entity.publishedAt).toBeUndefined();
    // tags defaults to [] in adapter when decode omitted/undefined
    expect(entity.tags).toEqual([]);
  });
});
