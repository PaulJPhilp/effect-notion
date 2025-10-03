import { Effect, Option } from "effect";
import type {
  NormalizedDatabaseSchema,
} from "../../NotionSchema.js";
import type { NotionError } from "../NotionClient/errors.js";

export interface NotionServiceApi {
  getDatabaseSchema: (
    databaseId: string
  ) => Effect.Effect<NormalizedDatabaseSchema, NotionError>;

  listArticles: (
    databaseId: string,
    titlePropertyName?: string,
    filter?: unknown,
    sorts?: unknown,
    pageSize?: number,
    startCursor?: string
  ) => Effect.Effect<{
    results: ReadonlyArray<{ id: string; title: string }>;
    hasMore: boolean;
    nextCursor: Option.Option<string>;
  }, NotionError>;

  listArticlesWithSchema: (
    databaseId: string,
    schema: NormalizedDatabaseSchema,
    titlePropertyName?: string,
    filter?: unknown,
    sorts?: unknown,
    pageSize?: number,
    startCursor?: string
  ) => Effect.Effect<{
    results: ReadonlyArray<{ id: string; title: string }>;
    hasMore: boolean;
    nextCursor: Option.Option<string>;
  }, NotionError>;

  listPagesWithSchema: (
    databaseId: string,
    schema: NormalizedDatabaseSchema,
    filter?: unknown,
    sorts?: unknown,
    pageSize?: number,
    startCursor?: string
  ) => Effect.Effect<{
    pages: ReadonlyArray<any>;
    hasMore: boolean;
    nextCursor: Option.Option<string>;
  }, NotionError>;

  getArticleMetadata: (
    pageId: string
  ) => Effect.Effect<{ properties: unknown }, NotionError>;

  updateArticleProperties: (
    pageId: string,
    properties: Record<string, unknown>
  ) => Effect.Effect<{ properties: unknown }, NotionError>;

  getArticleContent: (
    pageId: string
  ) => Effect.Effect<string, NotionError>;

  updateArticleContent: (
    pageId: string,
    content: string
  ) => Effect.Effect<void, NotionError>;
}
