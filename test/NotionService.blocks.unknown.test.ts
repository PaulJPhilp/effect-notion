import { describe, it, expect } from "vitest";
import { notionBlocksToMarkdown } from "../src/NotionService.js";
import type { Block } from "../src/NotionSchema.js";

describe("notionBlocksToMarkdown - unknown blocks are skipped", () => {
  it("renders known blocks and omits unknown types", () => {
    const blocks = [
      {
        id: "blk1",
        type: "paragraph",
        paragraph: { rich_text: [{ plain_text: "Hello" }] },
      },
      {
        id: "blk2",
        type: "callout",
        callout: { rich_text: [{ plain_text: "Ignored" }] },
      } as unknown as Block,
      {
        id: "blk3",
        type: "code",
        code: {
          rich_text: [{ plain_text: "console.log('x')" }],
          language: "js",
        },
      },
    ] as unknown as ReadonlyArray<Block>;

    const md = notionBlocksToMarkdown(blocks);
    expect(md).toContain("Hello");
    expect(md).toContain("```js");
    expect(md).not.toContain("Ignored");
  });
});
