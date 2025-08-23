// src/schema.ts
import { Schema } from "effect";

// --- Common ---
export const NonEmptyString = Schema.String.pipe(Schema.minLength(1));

// Notion IDs can be hyphenated UUIDs or 32-char hex without hyphens
const Hex32Id = Schema.String.pipe(
  Schema.pattern(/^[0-9a-fA-F]{32}$/),
);
export const NotionIdSchema = Schema.Union(Schema.UUID, Hex32Id);



// --- Notion query: typed subset ---
const SortDirectionSchema = Schema.Union(
  Schema.Literal("ascending"),
  Schema.Literal("descending"),
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
  DateFilterSchema,
);

export const FilterSchema = Schema.Union(
  FilterLeafSchema,
  Schema.Struct({ and: Schema.Array(FilterLeafSchema) }),
  Schema.Struct({ or: Schema.Array(FilterLeafSchema) }),
);

// --- /api/list-articles ---
export const ListArticlesRequestSchema = Schema.Struct({
  
  databaseId: NotionIdSchema,
  // Add a field to specify the title property, defaulting to "Name"
  titlePropertyName: Schema.optional(NonEmptyString),
  // Typed subset of Notion filters and sorts
  filter: Schema.optional(FilterSchema),
  sorts: Schema.optional(Schema.Array(SortSchema)),
});
export type ListArticlesRequest = Schema.Schema.Type<
  typeof ListArticlesRequestSchema
>;

const ArticleIdentifierSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
});
export const ListArticlesResponseSchema = Schema.Array(ArticleIdentifierSchema);
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
export const UpdateArticleContentRequestSchema = Schema.Struct({
  
  pageId: NotionIdSchema,
  content: NonEmptyString,
});
export type UpdateArticleContentRequest = Schema.Schema.Type<
  typeof UpdateArticleContentRequestSchema
>;