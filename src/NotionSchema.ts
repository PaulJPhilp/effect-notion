// src/NotionSchema.ts
import * as S from "effect/Schema";

// --- Base Schemas ---
const RichTextSchema = S.Array(S.Struct({ plain_text: S.String }));

// --- Page Object Schema ---
// Notion page properties can be of many different types. For decoding purposes
// we accept arbitrary property shapes and let higher-level code pick what it
// needs (e.g., the designated title property).
const PagePropertiesSchema = S.Record({
  key: S.String,
  value: S.Unknown,
});

export const PageSchema = S.Struct({
  object: S.Literal("page"),
  id: S.String,
  properties: PagePropertiesSchema,
});

// --- Block Object Schemas ---
const ParagraphBlockSchema = S.Struct({
  id: S.String,
  type: S.Literal("paragraph"),
  paragraph: S.Struct({ rich_text: RichTextSchema }),
});

const HeadingBlockSchema = S.Struct({
  id: S.String,
  type: S.Literal("heading_2"),
  heading_2: S.Struct({ rich_text: RichTextSchema }),
});

const BulletedListItemSchema = S.Struct({
  id: S.String,
  type: S.Literal("bulleted_list_item"),
  bulleted_list_item: S.Struct({ rich_text: RichTextSchema }),
});

const CodeBlockSchema = S.Struct({
  id: S.String,
  type: S.Literal("code"),
  code: S.Struct({
    rich_text: RichTextSchema,
    language: S.String,
  }),
});

// Permissive catch-all for any Notion block type we don't explicitly model.
// This allows us to decode lists even when new/unknown block types appear.
const UnknownBlockSchema = S.Struct({
  id: S.String,
  // Accept any block type string
  type: S.String,
  // Allow any additional payload without validation
}).pipe(S.attachPropertySignature("unknown", true as const));

// A union of all block types our service can understand and process
export const BlockSchema = S.Union(
  ParagraphBlockSchema,
  HeadingBlockSchema,
  BulletedListItemSchema,
  CodeBlockSchema,
  // Keep Unknown last to prioritize specific literals during decoding
  UnknownBlockSchema
);
export type Block = S.Schema.Type<typeof BlockSchema>;

// --- API List Response Schemas ---
// These generic schemas wrap the list responses from Notion's paginated APIs.
export const PageListResponseSchema = S.Struct({
  object: S.Literal("list"),
  results: S.Array(PageSchema),
  has_more: S.Boolean,
  next_cursor: S.OptionFromNullOr(S.String),
});
export type PageListResponse = S.Schema.Type<typeof PageListResponseSchema>;

export const BlockListResponseSchema = S.Struct({
  object: S.Literal("list"),
  results: S.Array(BlockSchema),
  has_more: S.Boolean,
  next_cursor: S.OptionFromNullOr(S.String),
});
export type BlockListResponse = S.Schema.Type<typeof BlockListResponseSchema>;

// Input block types for appendBlockChildren
const ParagraphInputSchema = S.Struct({
  object: S.Literal("block"),
  type: S.Literal("paragraph"),
  paragraph: S.Struct({
    rich_text: S.Array(S.Struct({ text: S.Struct({ content: S.String }) })),
  }),
});

const Heading2InputSchema = S.Struct({
  object: S.Literal("block"),
  type: S.Literal("heading_2"),
  heading_2: S.Struct({
    rich_text: S.Array(S.Struct({ text: S.Struct({ content: S.String }) })),
  }),
});

const BulletedListItemInputSchema = S.Struct({
  object: S.Literal("block"),
  type: S.Literal("bulleted_list_item"),
  bulleted_list_item: S.Struct({
    rich_text: S.Array(S.Struct({ text: S.Struct({ content: S.String }) })),
  }),
});

const CodeInputSchema = S.Struct({
  object: S.Literal("block"),
  type: S.Literal("code"),
  code: S.Struct({
    rich_text: S.Array(S.Struct({ text: S.Struct({ content: S.String }) })),
    language: S.optional(S.String),
  }),
});

export const NotionBlockInputSchema = S.Union(
  ParagraphInputSchema,
  Heading2InputSchema,
  BulletedListItemInputSchema,
  CodeInputSchema
);

export type NotionBlockInput = S.Schema.Type<typeof NotionBlockInputSchema>;

// --- Database Metadata Schema ---
// Minimal shape for GET /v1/databases/{database_id}
export const DatabaseSchema = S.Struct({
  object: S.Literal("database"),
  id: S.String,
  last_edited_time: S.String,
  // properties is a record keyed by property name; we only require the `type`
  // field at decode time, leaving the rest as Unknown for later per-type logic.
  properties: S.Record({
    key: S.String,
    // Preserve full Notion property configuration. We still rely on runtime
    // checks (in normalization) to read `type` and other fields.
    value: S.Unknown,
  }),
});
export type Database = S.Schema.Type<typeof DatabaseSchema>;

// Normalized representation stored in-memory by the service
export type NormalizedDatabaseSchema = {
  databaseId: string;
  titlePropertyName: string | null;
  properties: ReadonlyArray<{
    name: string;
    type: string;
    // raw per-type config is left as unknown for now
    config?: unknown;
  }>;
  lastEditedTime: string;
  propertiesHash: string;
};
