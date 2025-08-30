import { Chunk, Effect, Option } from "effect";
import { lexer } from "marked";
import type {
  Block,
  Database,
  NormalizedDatabaseSchema,
  NotionBlockInput,
} from "../../NotionSchema.js";

// ------------------------------
// Pure text helpers
// ------------------------------
const getText = (richText: ReadonlyArray<{ plain_text: string }>): string =>
  richText.map((t) => t.plain_text).join("");

export const notionBlocksToMarkdown = (
  blocks: ReadonlyArray<Block>,
): string => {
  const markdownLines = blocks
    .map((block) => {
      if ("paragraph" in block) {
        return getText(block.paragraph.rich_text);
      }
      if ("heading_2" in block) {
        return `## ${getText(block.heading_2.rich_text)}`;
      }
      if ("bulleted_list_item" in block) {
        return `* ${getText(block.bulleted_list_item.rich_text)}`;
      }
      if ("code" in block) {
        return [
          `\`\`\`${block.code.language || ""}`,
          getText(block.code.rich_text),
          "```",
        ].join("\n");
      }
      // Unknown or unsupported block type: skip
      return undefined;
    })
    .filter((line): line is string => typeof line === "string" && line.length > 0);
  return markdownLines.join("\n\n");
};

export const markdownToNotionBlocks = (
  markdown: string
): ReadonlyArray<NotionBlockInput> => {
  const tokens = lexer(markdown);
  const blocks: Array<NotionBlockInput> = [];

  for (const token of tokens) {
    switch (token.type) {
      case "heading":
        if (token.depth === 2) {
          blocks.push({
            object: "block",
            type: "heading_2",
            heading_2: { rich_text: [{ text: { content: token.text } }] },
          });
        }
        break;
      case "paragraph":
        blocks.push({
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: [{ text: { content: token.text } }] },
        });
        break;
      case "list":
        for (const item of token.items) {
          blocks.push({
            object: "block",
            type: "bulleted_list_item",
            bulleted_list_item: {
              rich_text: [{ text: { content: item.text } }],
            },
          });
        }
        break;
      case "code":
        blocks.push({
          object: "block",
          type: "code",
          code: {
            rich_text: [{ text: { content: token.text } }],
            language: token.lang || "plain text",
          },
        });
        break;
    }
  }
  return blocks;
};

// ------------------------------
// Pure data helpers
// ------------------------------
export const hashString = (input: string): string => {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
};

export const normalizeDatabase = (
  database: Database
): NormalizedDatabaseSchema => {
  const entries = Object.entries(database.properties);
  const properties = entries.map(([name, value]) => ({
    name,
    type: value?.type ?? "unknown",
    config: value,
  }));
  const titleProp = properties.find((p) => p.type === "title");
  const propertiesHash = hashString(
    JSON.stringify(properties.map((p) => ({ name: p.name, type: p.type })))
  );
  return {
    databaseId: database.id,
    titlePropertyName: titleProp ? titleProp.name : null,
    properties,
    lastEditedTime: database.last_edited_time,
    propertiesHash,
  };
};

// ------------------------------
// Effect helpers
// ------------------------------
export const getAllPaginatedResults = <
  T extends {
    has_more: boolean;
    next_cursor: Option.Option<string>;
    results: ReadonlyArray<unknown>;
  }
>(
  fetchFn: (cursor?: string) => Effect.Effect<T, unknown>
): Effect.Effect<ReadonlyArray<T["results"][number]>, unknown> =>
  Effect.gen(function* () {
    let cursor: string | undefined = undefined;
    let all: Array<T["results"][number]> = [];
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const page: T = yield* fetchFn(cursor);
      all = all.concat(Array.from(page.results));
      if (!page.has_more) break;
      cursor = Option.getOrUndefined(page.next_cursor);
      if (!cursor) break;
    }
    return all as ReadonlyArray<T["results"][number]>;
  });
