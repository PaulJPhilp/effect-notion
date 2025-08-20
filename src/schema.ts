// src/schema.ts
import { Schema } from "@effect/schema";

// =============================================================================
// Common Schemas
// =============================================================================

// Base schema for requests that require authentication
export const NotionAuthSchema = Schema.Struct({
  apiKey: Schema.String,
});

// =============================================================================
// /api/list-articles
// =============================================================================

export const ListArticlesRequestSchema = Schema.Struct({
  ...NotionAuthSchema.fields,
  databaseId: Schema.String,
});
export type ListArticlesRequest = Schema.Schema.To<
  typeof ListArticlesRequestSchema
>;

const ArticleIdentifierSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
});
export const ListArticlesResponseSchema = Schema.Array(ArticleIdentifierSchema);
export type ListArticlesResponse = Schema.Schema.To<
  typeof ListArticlesResponseSchema
>;

// =============================================================================
// /api/get-article-content
// =============================================================================

export const GetArticleContentRequestSchema = Schema.Struct({
  ...NotionAuthSchema.fields,
  pageId: Schema.String,
});
export type GetArticleContentRequest = Schema.Schema.To<
  typeof GetArticleContentRequestSchema
>;

export const GetArticleContentResponseSchema = Schema.Struct({
  content: Schema.String,
});
export type GetArticleContentResponse = Schema.Schema.To<
  typeof GetArticleContentResponseSchema
>;

// =============================================================================
// /api/update-article-content
// =============================================================================

export const UpdateArticleContentRequestSchema = Schema.Struct({
  ...NotionAuthSchema.fields,
  pageId: Schema.String,
  content: Schema.String,
});
export type UpdateArticleContentRequest = Schema.Schema.To<
  typeof UpdateArticleContentRequestSchema
>;