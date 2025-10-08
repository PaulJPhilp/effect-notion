import { Schema } from "effect";

const TrimmedString = Schema.transform(Schema.String, Schema.String, {
  decode: (value) => value.trim(),
  encode: (value) => value,
});

const NonEmptyTrimmedString = TrimmedString.pipe(Schema.minLength(1));

const NormalizedStringArray = Schema.transform(
  Schema.Array(Schema.String),
  Schema.Array(Schema.String),
  {
    decode: (values) => {
      const trimmed = values.map((value) => value.trim());
      return trimmed.filter((value) => value.length > 0);
    },
    encode: (values) => values,
  },
);

export const BaseEntity = Schema.Struct({
  id: NonEmptyTrimmedString, // `${source}_${pageId}`
  source: NonEmptyTrimmedString,
  pageId: NonEmptyTrimmedString,
  databaseId: NonEmptyTrimmedString,

  name: NonEmptyTrimmedString,
  description: Schema.optional(TrimmedString),

  createdAt: Schema.DateFromSelf,
  updatedAt: Schema.DateFromSelf,
  createdBy: Schema.optional(TrimmedString),
  updatedBy: Schema.optional(TrimmedString),

  type: Schema.optional(TrimmedString),
  tags: NormalizedStringArray,
  status: Schema.optional(TrimmedString),
  publishedAt: Schema.optional(Schema.DateFromSelf),
  warnings: Schema.optional(NormalizedStringArray),
});
export type BaseEntity = Schema.Schema.Type<typeof BaseEntity>;

export const ListParams = Schema.Struct({
  source: NonEmptyTrimmedString,
  pageSize: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.between(1, 100)),
  ),
  startCursor: Schema.optional(TrimmedString),
  filter: Schema.optional(
    Schema.Struct({
      statusEquals: Schema.optional(TrimmedString),
      typeEquals: Schema.optional(TrimmedString),
      tagIn: Schema.optional(NormalizedStringArray),
      publishedAfter: Schema.optional(Schema.DateFromSelf),
      publishedBefore: Schema.optional(Schema.DateFromSelf),
    }),
  ),
  sort: Schema.optional(
    Schema.Struct({
      key: Schema.Literal("publishedAt", "updatedAt", "createdAt", "name"),
      direction: Schema.Literal("ascending", "descending"),
    }),
  ),
});
export type ListParams = Schema.Schema.Type<typeof ListParams>;

// Kind aliases (extend later if needed)
export const Article = BaseEntity;
export type Article = BaseEntity;

export const Changelog = BaseEntity;
export type Changelog = BaseEntity;

export const Project = BaseEntity;
export type Project = BaseEntity;
