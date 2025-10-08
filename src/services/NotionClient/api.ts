import type { Effect } from "effect";
import type * as S from "effect/Schema";
import type * as NotionSchema from "../../NotionSchema.js";
import type { NotionError } from "./errors.js";

export interface NotionClientApi {
  retrievePage: (
    pageId: string,
  ) => Effect.Effect<
    S.Schema.Type<typeof NotionSchema.PageSchema>,
    NotionError
  >;

  createPage: (
    databaseId: string,
    properties: Record<string, unknown>,
  ) => Effect.Effect<
    S.Schema.Type<typeof NotionSchema.PageSchema>,
    NotionError
  >;

  updatePage: (
    pageId: string,
    body: { properties?: Record<string, unknown>; archived?: boolean },
  ) => Effect.Effect<
    S.Schema.Type<typeof NotionSchema.PageSchema>,
    NotionError
  >;

  retrieveDatabase: (
    databaseId: string,
  ) => Effect.Effect<
    S.Schema.Type<typeof NotionSchema.DatabaseSchema>,
    NotionError
  >;

  queryDatabase: (
    databaseId: string,
    body?: {
      filter?: unknown;
      sorts?: unknown;
      start_cursor?: string;
      page_size?: number;
    },
  ) => Effect.Effect<
    S.Schema.Type<typeof NotionSchema.PageListResponseSchema>,
    NotionError
  >;

  retrieveBlockChildren: (
    pageId: string,
    cursor?: string,
  ) => Effect.Effect<
    S.Schema.Type<typeof NotionSchema.BlockListResponseSchema>,
    NotionError
  >;

  deleteBlock: (blockId: string) => Effect.Effect<void, NotionError>;

  appendBlockChildren: (
    pageId: string,
    blocks: ReadonlyArray<NotionSchema.NotionBlockInput>,
  ) => Effect.Effect<
    S.Schema.Type<typeof NotionSchema.BlockListResponseSchema>,
    NotionError
  >;

  // Testing/utility: create a database with a provided properties config
  createDatabase: (
    parentPageId: string,
    title: string,
    properties: Record<string, unknown>,
  ) => Effect.Effect<
    S.Schema.Type<typeof NotionSchema.DatabaseSchema>,
    NotionError
  >;
}
