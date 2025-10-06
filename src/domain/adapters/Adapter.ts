import type { BaseEntity, ListParams } from "../logical/Common.js"

export interface EntityAdapter<E extends BaseEntity> {
  toNotionQuery: (args: {
    databaseId: string
    params: ListParams
  }) => {
    filter?: any
    sorts?: any[]
    page_size: number
    start_cursor?: string
  }

  fromNotionPage: (args: {
    source: string
    databaseId: string
    page: any
  }) => E

  toNotionProperties: (args: {
    patch: Partial<E>
  }) => Record<string, any>

  toNotionBlocks?: (args: { markdown: string }) => any[]
  fromNotionBlocks?: (args: { blocks: any[] }) => { markdown: string }
}
