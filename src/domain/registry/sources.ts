import type { BaseEntity } from "../logical/Common.js"
import type { EntityAdapter } from "../adapters/Adapter.js"
import { blogArticleAdapter } from "../adapters/articles/blog.adapter.js"

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

const loadFromEnv = (): SourceConfig[] => {
  const out: SourceConfig[] = []
  const BLOG_DB = process.env.NOTION_DB_ARTICLES_BLOG
  if (BLOG_DB && BLOG_DB.length > 0) {
    out.push({
      alias: "blog",
      databaseId: BLOG_DB,
      kind: "articles",
      adapter: blogArticleAdapter,
      capabilities: { update: true, delete: true },
    })
  }
  return out
}

export const Sources = {
  all: (): ReadonlyArray<SourceConfig> => loadFromEnv(),
  ofKind(kind: Kind) {
    return loadFromEnv().filter((s) => s.kind === kind)
  },
  resolve(kind: Kind, alias: string) {
    const s = loadFromEnv().find((s) => s.kind === kind && s.alias === alias)
    if (!s) {
      throw new Error(`Unknown source: ${kind}/${alias}`)
    }
    return s
  },
}
