import { Schema } from "effect"

export const BaseEntity = Schema.Struct({
  id: Schema.String, // `${source}_${pageId}`
  source: Schema.String,
  pageId: Schema.String,
  databaseId: Schema.String,

  name: Schema.String,
  description: Schema.optional(Schema.String),

  createdAt: Schema.DateFromSelf,
  updatedAt: Schema.DateFromSelf,
  createdBy: Schema.optional(Schema.String),
  updatedBy: Schema.optional(Schema.String),

  type: Schema.optional(Schema.String),
  tags: Schema.Array(Schema.String),
  status: Schema.optional(Schema.String),
  publishedAt: Schema.optional(Schema.DateFromSelf),
  warnings: Schema.optional(Schema.Array(Schema.String)),
})
export type BaseEntity = Schema.Schema.Type<typeof BaseEntity>

export const ListParams = Schema.Struct({
  source: Schema.String,
  pageSize: Schema.optional(
    Schema.Number.pipe(Schema.int(), Schema.between(1, 100))
  ),
  startCursor: Schema.optional(Schema.String),
  filter: Schema.optional(
    Schema.Struct({
      statusEquals: Schema.optional(Schema.String),
      typeEquals: Schema.optional(Schema.String),
      tagIn: Schema.optional(Schema.Array(Schema.String)),
      publishedAfter: Schema.optional(Schema.DateFromSelf),
      publishedBefore: Schema.optional(Schema.DateFromSelf),
    })
  ),
  sort: Schema.optional(
    Schema.Struct({
      key: Schema.Literal("publishedAt", "updatedAt", "createdAt", "name"),
      direction: Schema.Literal("ascending", "descending"),
    })
  ),
})
export type ListParams = Schema.Schema.Type<typeof ListParams>

// Kind aliases (extend later if needed)
export const Article = BaseEntity
export type Article = BaseEntity

export const Changelog = BaseEntity
export type Changelog = BaseEntity

export const Project = BaseEntity
export type Project = BaseEntity
