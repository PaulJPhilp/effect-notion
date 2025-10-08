import type { BaseEntity, ListParams } from "../logical/Common.js";

export interface EntityAdapter<E extends BaseEntity> {
  toNotionQuery: (args: { databaseId: string; params: ListParams }) => {
    filter?: unknown;
    sorts?: unknown[];
    page_size: number;
    start_cursor?: string;
  };

  fromNotionPage: (args: {
    source: string;
    databaseId: string;
    page: unknown;
  }) => E;

  toNotionProperties: (args: { patch: Partial<E> }) => Record<string, unknown>;

  toNotionBlocks?: (args: { markdown: string }) => unknown[];
  fromNotionBlocks?: (args: { blocks: unknown[] }) => { markdown: string };
}
