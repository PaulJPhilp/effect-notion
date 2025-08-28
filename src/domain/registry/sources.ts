import type { BaseEntity } from "../logical/Common"
import type { EntityAdapter } from "../adapters/Adapter"

export type Kind = "articles" | "changelog" | "projects"

export type SourceConfig<E extends BaseEntity = BaseEntity> = {
  alias: string
  databaseId: string
  kind: Kind
  adapter: EntityAdapter<E>
  capabilities: {
    update: boolean
    delete: boolean
  }
}

const sourcesInternal: SourceConfig[] = [
  // Populate from env + adapters.
  // Example:
  // {
  //   alias: "blog",
  //   databaseId: process.env.NOTION_DB_ARTICLES_BLOG!,
  //   kind: "articles",
  //   adapter: blogArticleAdapter,
  //   capabilities: { update: true, delete: true },
  // },
]

export const Sources = {
  all: () => sourcesInternal,
  ofKind(kind: Kind) {
    return sourcesInternal.filter((s) => s.kind === kind)
  },
  resolve(kind: Kind, alias: string) {
    const s = sourcesInternal.find((s) => s.kind === kind && s.alias === alias)
    if (!s) {
      throw new Error(`Unknown source: ${kind}/${alias}`)
    }
    return s
  },
}
