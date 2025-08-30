import { Effect } from "effect";
import type * as S from "effect/Schema";
import * as NotionSchema from "../../NotionSchema.js";
import type { NotionError } from "./errors.js";

export interface NotionClientApi {
  retrievePage: (
    apiKey: string,
    pageId: string
  ) => Effect.Effect<S.Schema.Type<typeof NotionSchema.PageSchema>, NotionError>;

  createPage: (
    apiKey: string,
    databaseId: string,
    properties: Record<string, unknown>
  ) => Effect.Effect<S.Schema.Type<typeof NotionSchema.PageSchema>, NotionError>;

  updatePage: (
    apiKey: string,
    pageId: string,
    body: { properties?: Record<string, unknown>; archived?: boolean }
  ) => Effect.Effect<S.Schema.Type<typeof NotionSchema.PageSchema>, NotionError>;

  retrieveDatabase: (
    apiKey: string,
    databaseId: string
  ) => Effect.Effect<S.Schema.Type<typeof NotionSchema.DatabaseSchema>, NotionError>;

  queryDatabase: (
    apiKey: string,
    databaseId: string,
    body?: {
      filter?: unknown;
      sorts?: unknown;
      start_cursor?: string;
      page_size?: number;
    }
  ) => Effect.Effect<S.Schema.Type<typeof NotionSchema.PageListResponseSchema>, NotionError>;

  retrieveBlockChildren: (
    apiKey: string,
    pageId: string,
    cursor?: string
  ) => Effect.Effect<S.Schema.Type<typeof NotionSchema.BlockListResponseSchema>, NotionError>;

  deleteBlock: (
    apiKey: string,
    blockId: string
  ) => Effect.Effect<void, NotionError>;

  appendBlockChildren: (
    apiKey: string,
    pageId: string,
    blocks: ReadonlyArray<NotionSchema.NotionBlockInput>
  ) => Effect.Effect<S.Schema.Type<typeof NotionSchema.BlockListResponseSchema>, NotionError>;
}
