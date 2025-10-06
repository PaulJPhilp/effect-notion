import { Effect } from "effect";
import type { BaseEntity, ListParams } from "../../domain/logical/Common.js";
import type { NotionError } from "../NotionClient/errors.js";
import type { ListResult } from "./types.ts";

export interface ArticlesRepositoryApi {
  list: (params: ListParams) => Effect.Effect<ListResult, NotionError>;

  get: (
    args: { source: string; pageId: string }
  ) => Effect.Effect<BaseEntity, NotionError>;

  create: (
    args: { source: string; data: Partial<BaseEntity> }
  ) => Effect.Effect<BaseEntity, NotionError>;

  update: (
    args: { source: string; pageId: string; patch: Partial<BaseEntity> }
  ) => Effect.Effect<BaseEntity, NotionError>;

  delete: (
    args: { source: string; pageId: string }
  ) => Effect.Effect<void, NotionError>;
}
