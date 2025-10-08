import * as S from "effect/Schema";
import { describe, expect, it } from "vitest";
import { BlockListResponseSchema } from "../src/NotionSchema.js";

describe("NotionSchema BlockListResponse - unknown block types", () => {
  it("decodes lists containing unknown block types without error", () => {
    const raw = {
      object: "list",
      results: [
        {
          id: "blk_paragraph_1",
          type: "paragraph",
          paragraph: { rich_text: [{ plain_text: "Hello" }] },
        },
        {
          id: "blk_callout_1",
          type: "callout",
          callout: { rich_text: [{ plain_text: "Ignored" }] },
        },
      ],
      has_more: false,
      next_cursor: null,
    } as const;

    const decoded = S.decodeUnknownSync(BlockListResponseSchema)(raw);

    expect(decoded.object).toBe("list");
    expect(decoded.has_more).toBe(false);
    expect(decoded.results.length).toBe(2);

    // Known block preserved
    expect((decoded.results[0] as { type: string }).type).toBe("paragraph");

    // Unknown block passes through as generic with type string
    const unk = decoded.results[1] as { type: string };
    expect(typeof unk.type).toBe("string");
    expect(unk.type).toBe("callout");
  });
});
