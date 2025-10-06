import { Chunk, Effect, Option, Stream } from "effect";
import * as Match from "effect/Match";
import * as S from "effect/Schema";
import { lexer, setOptions } from "marked";
import type {
  Block,
  Database,
  NormalizedDatabaseSchema,
  NotionBlockInput,
} from "../../NotionSchema.js";

/**
 * Configure marked library for safe markdown parsing.
 *
 * Security notes:
 * - We don't sanitize because the output goes to Notion API, not directly
 *   to users. Notion handles its own sanitization.
 * - gfm: GitHub Flavored Markdown for better compatibility
 * - breaks: Convert line breaks to <br> for readability
 *
 * If this markdown is ever rendered directly to users (e.g., in a preview),
 * you MUST add HTML sanitization (e.g., DOMPurify) before rendering.
 */
setOptions({
  gfm: true, // GitHub Flavored Markdown
  breaks: true, // Convert \n to <br>
});

// ------------------------------
// Pure text helpers
// ------------------------------
const getText = (richText: ReadonlyArray<{ plain_text: string }>): string =>
  richText.map((t) => t.plain_text).join("");

export const notionBlocksToMarkdown = (
  blocks: ReadonlyArray<Block>
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
    .filter(
      (line): line is string => typeof line === "string" && line.length > 0
    );
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
  const properties = entries.map(([name, value]) => {
    const v = value as { type?: unknown } & Record<string, unknown>;
    const type = typeof v?.type === "string" ? (v.type as string) : "unknown";
    return {
      name,
      type,
      config: v as unknown,
    } as const;
  });
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

// ----------------------------------
// Dynamic schema builder helpers (split to reduce complexity)
// ----------------------------------
const U = <A, I>(
  sch: S.Schema<A, I, never>
): S.Schema<unknown, unknown, never> =>
  sch as unknown as S.Schema<unknown, unknown, never>;

function schemaForPrimitiveType(
  type: string
): S.Schema<unknown, unknown, never> | undefined {
  if (type === "title" || type === "rich_text") {
    return U(S.String);
  }
  if (type === "number") {
    return U(S.Union(S.Number, S.Undefined));
  }
  if (type === "checkbox") {
    return U(S.Boolean);
  }
  if (type === "date") {
    return U(S.Union(S.DateFromSelf, S.Undefined));
  }
  if (type === "url" || type === "email") {
    return U(S.Union(S.String, S.Undefined));
  }
  if (type === "files") {
    return U(S.Array(S.String));
  }
  if (type === "people" || type === "relation") {
    return U(S.Array(S.String));
  }
  return undefined;
}

function schemaForSelect(
  cfg: Record<string, unknown>
): S.Schema<unknown, unknown, never> {
  const opts = (
    cfg && typeof cfg === "object" && "select" in cfg
      ? (cfg as { select?: { options?: ReadonlyArray<{ name: string }> } })
          .select?.options ?? []
      : []
  ) as ReadonlyArray<{ name: string }>;
  if (opts.length === 0) {
    return U(S.Union(S.String, S.Undefined));
  }
  const lits = opts.map((o) => S.Literal(o.name));
  return U(S.Union(...lits, S.Undefined));
}

function schemaForMultiSelect(
  cfg: Record<string, unknown>
): S.Schema<unknown, unknown, never> {
  const opts = (
    cfg && typeof cfg === "object" && "multi_select" in cfg
      ? (
          cfg as {
            multi_select?: { options?: ReadonlyArray<{ name: string }> };
          }
        ).multi_select?.options ?? []
      : []
  ) as ReadonlyArray<{ name: string }>;
  if (opts.length === 0) {
    return U(S.Array(S.String));
  }
  const lits = opts.map((o) => S.Literal(o.name));
  return U(S.Array(S.Union(...lits)));
}

function schemaForFormula(
  cfg: Record<string, unknown>
): S.Schema<unknown, unknown, never> {
  const ftype =
    cfg && typeof cfg === "object" && "formula" in cfg
      ? ((cfg as { formula?: { type?: string } }).formula?.type as
          | string
          | undefined)
      : undefined;
  if (ftype === "number") {
    return U(S.Union(S.Number, S.Undefined));
  }
  if (ftype === "string") {
    return U(S.Union(S.String, S.Undefined));
  }
  if (ftype === "boolean") {
    return U(S.Union(S.Boolean, S.Undefined));
  }
  if (ftype === "date") {
    return U(S.Union(S.DateFromSelf, S.Undefined));
  }
  return U(S.Unknown);
}

function schemaForType(
  type: string,
  cfg: Record<string, unknown>
): S.Schema<unknown, unknown, never> {
  return Match.value(type).pipe(
    Match.when("title", () => U(S.String)),
    Match.when("rich_text", () => U(S.String)),
    Match.when("number", () => U(S.Union(S.Number, S.Undefined))),
    Match.when("checkbox", () => U(S.Boolean)),
    Match.when("date", () => U(S.Union(S.DateFromSelf, S.Undefined))),
    Match.when("url", () => U(S.Union(S.String, S.Undefined))),
    Match.when("email", () => U(S.Union(S.String, S.Undefined))),
    Match.when("files", () => U(S.Array(S.String))),
    Match.when("people", () => U(S.Array(S.String))),
    Match.when("relation", () => U(S.Array(S.String))),
    Match.when("select", () => schemaForSelect(cfg)),
    Match.when("multi_select", () => schemaForMultiSelect(cfg)),
    Match.when("formula", () => schemaForFormula(cfg)),
    Match.orElse(() => U(S.Unknown))
  );
}

// ----------------------------------
// Runtime dynamic Effect Schema builder
// ----------------------------------
export const buildRuntimeEffectSchema = (schema: NormalizedDatabaseSchema) => {
  const fields: Record<string, S.Schema<unknown, unknown, never>> = {};

  for (const p of schema.properties) {
    fields[p.name] = schemaForType(
      p.type,
      (p.config ?? {}) as Record<string, unknown>
    );
  }

  const struct = S.Struct(fields);
  return {
    struct,
  } as const;
};

// ------------------------------
// Effect helpers
// ------------------------------

/**
 * Fetches all paginated results using Stream.paginateEffect.
 * 
 * This follows the Effect pattern for handling paginated APIs by
 * modeling the pagination as a stream that automatically handles
 * cursor-based iteration.
 * 
 * @param fetchFn - Function that fetches a page given an optional cursor
 * @returns Effect that yields all results as a readonly array
 */
export const getAllPaginatedResults = <
  T extends {
    has_more: boolean;
    next_cursor: Option.Option<string>;
    results: ReadonlyArray<unknown>;
  },
  E
>(
  fetchFn: (cursor?: string) => Effect.Effect<T, E>
): Effect.Effect<ReadonlyArray<T["results"][number]>, E> =>
  Stream.paginateChunkEffect(
    undefined as string | undefined,
    (cursor: string | undefined) =>
      fetchFn(cursor).pipe(
        Effect.map((page): readonly [Chunk.Chunk<unknown>, Option.Option<string | undefined>] => [
          Chunk.fromIterable(page.results),
          page.has_more
            ? page.next_cursor
            : Option.none<string | undefined>(),
        ])
      )
  ).pipe(
    Stream.runCollect,
    Effect.map((chunk) => Chunk.toReadonlyArray(chunk) as ReadonlyArray<T["results"][number]>)
  );

// ----------------------------------
// Builder: simple spec -> Notion database properties
// ----------------------------------
export interface SimpleDbSpecField {
  type:
    | "title"
    | "rich_text"
    | "number"
    | "checkbox"
    | "date"
    | "url"
    | "email"
    | "files"
    | "people"
    | "relation"
    | "select"
    | "multi_select"
    | "status"
    | "formula";
  options?: ReadonlyArray<string>; // for select/multi_select/status
  formulaType?: "number" | "string" | "boolean" | "date"; // for formula
}

export type SimpleDbSpec = Record<string, SimpleDbSpecField>;

export function buildNotionPropertiesFromSimpleSpec(
  spec: SimpleDbSpec
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [name, field] of Object.entries(spec)) {
    switch (field.type) {
      case "title":
        props[name] = { title: {} };
        break;
      case "rich_text":
        props[name] = { rich_text: {} };
        break;
      case "number":
        props[name] = { number: {} };
        break;
      case "checkbox":
        props[name] = { checkbox: {} };
        break;
      case "date":
        props[name] = { date: {} };
        break;
      case "url":
        props[name] = { url: {} };
        break;
      case "email":
        props[name] = { email: {} };
        break;
      case "files":
        props[name] = { files: {} };
        break;
      case "people":
        props[name] = { people: {} };
        break;
      case "relation":
        props[name] = { relation: { database_id: "", single_property: {} } };
        break;
      case "select":
        props[name] = {
          select: {
            options: (field.options ?? []).map((n) => ({ name: n })),
          },
        };
        break;
      case "multi_select":
        props[name] = {
          multi_select: {
            options: (field.options ?? []).map((n) => ({ name: n })),
          },
        };
        break;
      case "status":
        props[name] = {
          status: {
            options: (field.options ?? []).map((n) => ({ name: n })),
          },
        };
        break;
      case "formula":
        props[name] = {
          formula: {
            expression: "",
            type: field.formulaType ?? "number",
          },
        };
        break;
    }
  }
  return props;
}
