const DatabaseFieldSpecSchema = Schema.Struct({
  type: Schema.Union(
    Schema.Literal("title"),
    Schema.Literal("rich_text"),
    Schema.Literal("number"),
    Schema.Literal("checkbox"),
    Schema.Literal("date"),
    Schema.Literal("url"),
    Schema.Literal("email"),
    Schema.Literal("files"),
    Schema.Literal("people"),
    Schema.Literal("relation"),
    Schema.Literal("select"),
    Schema.Literal("multi_select"),
    Schema.Literal("status"),
    Schema.Literal("formula")
  ),
  options: Schema.optional(Schema.Array(Schema.String)),
  formulaType: Schema.optional(
    Schema.Union(
      Schema.Literal("number"),
      Schema.Literal("string"),
      Schema.Literal("boolean"),
      Schema.Literal("date")
    )
  ),
});

const RawDatabaseSpecSchema = Schema.Record({
  key: Schema.String,
  value: DatabaseFieldSpecSchema,
});

const NormalizedDatabaseSpecSchema = RawDatabaseSpecSchema.pipe(
  Schema.transform(RawDatabaseSpecSchema, {
    decode: (spec) => {
      const normalizedEntries = Object.entries(spec).map(([key, value]) => {
        const trimmedKey = key.trim();
        if (trimmedKey.length === 0) {
          throw new Error("Database field names must not be empty after trimming");
        }
        return [trimmedKey, value] as const;
      });
      return Object.fromEntries(normalizedEntries);
    },
    encode: (spec) => spec,
  })
);

// src/schema.ts
import { Schema } from "effect";

// --- Common ---
const TrimmedString = Schema.transform(
  Schema.String,
  Schema.String,
  {
    decode: (value) => value.trim(),
    encode: (value) => value,
  }
);

export const NonEmptyString = TrimmedString.pipe(Schema.minLength(1));

// Be permissive for IDs at the router boundary so upstream (Notion API)
// determines invalid IDs and we can surface proper 404s via error mapping.
export const NotionIdSchema = NonEmptyString;

// --- Notion query: typed subset ---
const SortDirectionSchema = Schema.Union(
  Schema.Literal("ascending"),
  Schema.Literal("descending")
);

export const SortSchema = Schema.Struct({
  property: NonEmptyString,
  direction: SortDirectionSchema,
});

// Property-specific filter operator shapes
const SelectOps = Schema.Struct({
  equals: Schema.optional(Schema.String),
  does_not_equal: Schema.optional(Schema.String),
  is_empty: Schema.optional(Schema.Boolean),
  is_not_empty: Schema.optional(Schema.Boolean),
});
const MultiSelectOps = Schema.Struct({
  contains: Schema.optional(Schema.String),
  does_not_contain: Schema.optional(Schema.String),
  is_empty: Schema.optional(Schema.Boolean),
  is_not_empty: Schema.optional(Schema.Boolean),
});
const TitleTextOps = Schema.Struct({
  contains: Schema.optional(Schema.String),
  does_not_contain: Schema.optional(Schema.String),
  equals: Schema.optional(Schema.String),
  does_not_equal: Schema.optional(Schema.String),
  is_empty: Schema.optional(Schema.Boolean),
  is_not_empty: Schema.optional(Schema.Boolean),
});
const RichTextOps = TitleTextOps;
const StatusOps = SelectOps;
const CheckboxOps = Schema.Struct({
  equals: Schema.optional(Schema.Boolean),
  does_not_equal: Schema.optional(Schema.Boolean),
});
const NumberOps = Schema.Struct({
  equals: Schema.optional(Schema.Number),
  does_not_equal: Schema.optional(Schema.Number),
  greater_than: Schema.optional(Schema.Number),
  less_than: Schema.optional(Schema.Number),
  greater_than_or_equal_to: Schema.optional(Schema.Number),
  less_than_or_equal_to: Schema.optional(Schema.Number),
  is_empty: Schema.optional(Schema.Boolean),
  is_not_empty: Schema.optional(Schema.Boolean),
});
const DateOps = Schema.Struct({
  equals: Schema.optional(Schema.String),
  before: Schema.optional(Schema.String),
  after: Schema.optional(Schema.String),
  on_or_before: Schema.optional(Schema.String),
  on_or_after: Schema.optional(Schema.String),
  past_week: Schema.optional(Schema.Struct({})),
  past_month: Schema.optional(Schema.Struct({})),
  past_year: Schema.optional(Schema.Struct({})),
  next_week: Schema.optional(Schema.Struct({})),
  next_month: Schema.optional(Schema.Struct({})),
  next_year: Schema.optional(Schema.Struct({})),
  is_empty: Schema.optional(Schema.Boolean),
  is_not_empty: Schema.optional(Schema.Boolean),
});

// Leaf property filters
const TitleFilterSchema = Schema.Struct({
  property: NonEmptyString,
  title: TitleTextOps,
});
const RichTextFilterSchema = Schema.Struct({
  property: NonEmptyString,
  rich_text: RichTextOps,
});
const SelectFilterSchema = Schema.Struct({
  property: NonEmptyString,
  select: SelectOps,
});
const MultiSelectFilterSchema = Schema.Struct({
  property: NonEmptyString,
  multi_select: MultiSelectOps,
});
const StatusFilterSchema = Schema.Struct({
  property: NonEmptyString,
  status: StatusOps,
});
const CheckboxFilterSchema = Schema.Struct({
  property: NonEmptyString,
  checkbox: CheckboxOps,
});
const NumberFilterSchema = Schema.Struct({
  property: NonEmptyString,
  number: NumberOps,
});
const DateFilterSchema = Schema.Struct({
  property: NonEmptyString,
  date: DateOps,
});

// Compound filters (one level of nesting)
const FilterLeafSchema = Schema.Union(
  TitleFilterSchema,
  RichTextFilterSchema,
  SelectFilterSchema,
  MultiSelectFilterSchema,
  StatusFilterSchema,
  CheckboxFilterSchema,
  NumberFilterSchema,
  DateFilterSchema
);

export const FilterSchema = Schema.Union(
  FilterLeafSchema,
  Schema.Struct({ and: Schema.Array(FilterLeafSchema) }),
  Schema.Struct({ or: Schema.Array(FilterLeafSchema) })
);

// --- /api/list-articles ---
export const ListArticlesRequestSchema = Schema.Struct({
  databaseId: NotionIdSchema,
  // Add a field to specify the title property, defaulting to "Name"
  titlePropertyName: Schema.optional(NonEmptyString),
  // Typed subset of Notion filters and sorts
  filter: Schema.optional(FilterSchema),
  sorts: Schema.optional(Schema.Array(SortSchema)),
  // Pagination
  pageSize: Schema.optional(
    Schema.Number.pipe(
      Schema.int(),
      Schema.greaterThanOrEqualTo(1),
      Schema.lessThanOrEqualTo(100)
    )
  ),
  startCursor: Schema.optional(NonEmptyString),
});
export type ListArticlesRequest = Schema.Schema.Type<
  typeof ListArticlesRequestSchema
>;

const ArticleIdentifierSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
});
export const ListArticlesResponseSchema = Schema.Struct({
  results: Schema.Array(ArticleIdentifierSchema),
  hasMore: Schema.Boolean,
  nextCursor: Schema.OptionFromNullOr(Schema.String),
});
export type ListArticlesResponse = Schema.Schema.Type<
  typeof ListArticlesResponseSchema
>;

// --- /api/get-article-content ---
export const GetArticleContentRequestSchema = Schema.Struct({
  pageId: NotionIdSchema,
});
export type GetArticleContentRequest = Schema.Schema.Type<
  typeof GetArticleContentRequestSchema
>;

export const GetArticleContentResponseSchema = Schema.Struct({
  content: Schema.String,
});
export type GetArticleContentResponse = Schema.Schema.Type<
  typeof GetArticleContentResponseSchema
>;

// --- /api/update-article-content ---
// Notion has a 2000 character limit per block, and content is split into blocks.
// We set a conservative 50KB limit (≈50,000 chars) for total content size.
// This allows ~25 blocks of rich content while preventing abuse.
const MAX_CONTENT_LENGTH = 50 * 1024; // 50KB

export const UpdateArticleContentRequestSchema = Schema.Struct({
  pageId: NotionIdSchema,
  content: NonEmptyString.pipe(
    Schema.maxLength(MAX_CONTENT_LENGTH, {
      message: () =>
        `Content must not exceed ${MAX_CONTENT_LENGTH} characters (got ${MAX_CONTENT_LENGTH}+)`,
    })
  ),
});
export type UpdateArticleContentRequest = Schema.Schema.Type<
  typeof UpdateArticleContentRequestSchema
>;

// --- /api/get-database-schema ---
export const GetDatabaseSchemaRequestSchema = Schema.Struct({
  databaseId: NotionIdSchema,
});
export type GetDatabaseSchemaRequest = Schema.Schema.Type<
  typeof GetDatabaseSchemaRequestSchema
>;

// Mirror of NormalizedDatabaseSchema from NotionSchema.ts
const DatabasePropertySchema = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  config: Schema.optional(Schema.Unknown),
});
export const NormalizedDatabaseSchemaSchema = Schema.Struct({
  databaseId: Schema.String,
  // Backward/forward compatibility: accept either/both names
  titlePropertyName: Schema.Union(Schema.String, Schema.Null),
  titleProperty: Schema.Union(Schema.String, Schema.Null),
  properties: Schema.Array(DatabasePropertySchema),
  lastEditedTime: Schema.String,
  propertiesHash: Schema.String,
});
export type NormalizedDatabaseSchemaJson = Schema.Schema.Type<
  typeof NormalizedDatabaseSchemaSchema
>;

// --- /api/get-article-metadata ---
export const GetArticleMetadataRequestSchema = Schema.Struct({
  pageId: NotionIdSchema,
});
export type GetArticleMetadataRequest = Schema.Schema.Type<
  typeof GetArticleMetadataRequestSchema
>;

export const GetArticleMetadataResponseSchema = Schema.Struct({
  id: Schema.String,
  properties: Schema.Unknown,
});
export type GetArticleMetadataResponse = Schema.Schema.Type<
  typeof GetArticleMetadataResponseSchema
>;

// --------------------------------------------
// Dynamic DB endpoints (Notion-native shapes)
// --------------------------------------------
export const DbQueryRequestSchema = Schema.Struct({
  databaseId: NotionIdSchema,
  filter: Schema.optional(Schema.Unknown),
  sorts: Schema.optional(Schema.Unknown),
  pageSize: Schema.optional(
    Schema.Number.pipe(
      Schema.int(),
      Schema.greaterThanOrEqualTo(1),
      Schema.lessThanOrEqualTo(100)
    )
  ),
  startCursor: Schema.optional(NonEmptyString),
});
export type DbQueryRequest = Schema.Schema.Type<typeof DbQueryRequestSchema>;

export const DbQueryResponseSchema = Schema.Struct({
  pages: Schema.Array(Schema.Unknown),
  hasMore: Schema.Boolean,
  nextCursor: Schema.OptionFromNullOr(Schema.String),
});
export type DbQueryResponse = Schema.Schema.Type<typeof DbQueryResponseSchema>;

export const DbGetPageRequestSchema = Schema.Struct({
  pageId: NotionIdSchema,
});
export type DbGetPageRequest = Schema.Schema.Type<
  typeof DbGetPageRequestSchema
>;

export const DbGetPageResponseSchema = Schema.Unknown;
export type DbGetPageResponse = unknown;

export const DbCreatePageRequestSchema = Schema.Struct({
  databaseId: NotionIdSchema,
  properties: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});
export type DbCreatePageRequest = Schema.Schema.Type<
  typeof DbCreatePageRequestSchema
>;
export const DbCreatePageResponseSchema = Schema.Unknown;
export type DbCreatePageResponse = unknown;

export const DbUpdatePageRequestSchema = Schema.Struct({
  pageId: NotionIdSchema,
  properties: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});
export type DbUpdatePageRequest = Schema.Schema.Type<
  typeof DbUpdatePageRequestSchema
>;
export const DbUpdatePageResponseSchema = Schema.Unknown;
export type DbUpdatePageResponse = unknown;

// --- Dynamic database operations ---
export const DbCreateDatabaseRequestSchema = Schema.Struct({
  parentPageId: NonEmptyString,
  title: NonEmptyString,
  spec: NormalizedDatabaseSpecSchema,
})

export const DbCreateDatabaseResponseSchema = Schema.Struct({
  databaseId: NonEmptyString,
  properties: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      type: Schema.String,
      config: Schema.optional(Schema.Unknown),
    })
  ),
});

export const DbGetSchemaRequestSchema = Schema.Struct({
  databaseId: NonEmptyString,
});

export const DbGetSchemaResponseSchema = Schema.Struct({
  schema: Schema.Unknown,
  properties: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      type: Schema.String,
      config: Schema.optional(Schema.Unknown),
    })
  ),
});
