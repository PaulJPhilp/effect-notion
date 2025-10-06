Product Requirements Document (PRD)
- Title: Multi-Database Articles, Adapter-Driven Mapping, Backward-Compatible APIs
- Owner: Paul
- Date: 30 Aug 2025
- Summary
  - Extend the Effect-based Notion proxy to support multiple databases (sources) for the Articles kind behind a stable, typed API.
  - Keep the schema-driven adapter pattern and lay groundwork for future kinds (changelog, projects).
- Goals
  - Support multiple databases (sources) under one Notion API key.
  - Keep client API stable via logical models and field names decoupled from Notion property names.
  - Two-way CRUD for Articles; archive on delete.
  - Expose content read/write endpoints for Articles.
  - Maintain normalized, consistent error envelopes with requestId.
  - Run on Bun locally and Vercel Edge/Node (2 GB memory).
- Non-Goals
  - Cross-database merged pagination and global sorting.
  - Full-text search.
  - Build-time code generation and schema registry (may be added later).
- Users and Use Cases
  - Frontend apps (blogs, docs sites, portfolios) needing secure Notion access without exposing API keys, spanning multiple databases for Articles.
- Functional Requirements
  - Kinds: Articles implemented; changelog and projects planned.
  - Routing:
    - Endpoints are namespaced per kind: /api/articles/* (implemented), /api/changelog/*, /api/projects/* (planned).
    - Each request requires a source alias identifying the physical database.
  - CRUD (Articles)
    - list: POST /api/articles/list with filters/sorts/cursor; returns { results, hasMore, nextCursor }.
    - get: GET /api/articles/get?pageId=&source=; returns BaseEntity (+ optional warnings).
    - create: POST /api/articles/create; returns created BaseEntity.
    - update: POST /api/articles/update; returns updated BaseEntity.
    - delete (archive): POST /api/articles/delete; archives the page (204).
  - Backward-compatible endpoints (retained)
    - POST /api/list-articles, GET /api/get-database-schema, GET /api/get-article-metadata, GET /api/get-article-content, POST /api/update-article-content.
  - Logical Model Fields (Articles)
    - id (logical): `${source}_${pageId}`
    - source (alias), pageId, databaseId
    - name (string), description (string?)
    - createdAt, updatedAt (from Notion system created_time, last_edited_time)
    - createdBy, updatedBy (from Notion system created_by, last_edited_by; stringify name or id)
    - type (string?), tags (string[]), status (string?)
    - publishedAt (Date?)
    - warnings? (string[]) — non-fatal adapter decode notes
  - Filters/Sorts (Articles list)
    - Filters: statusEquals, typeEquals, tagIn (OR across tags), publishedAfter, publishedBefore
    - Sorts: by publishedAt, updatedAt, createdAt, name; ascending/descending
  - Validation
    - Validate request bodies and responses with Effect Schema.
  - Errors
    - Normalized JSON envelope with error, code, requestId, detail, errors[]; include source and databaseId when relevant.
- Non-Functional Requirements
  - Performance: Handle 100–1000 items per source; page sizes 20–100. Single-source queries only; preserve Notion cursor for pagination.
  - Reliability: Timeouts and retries for Notion calls. Structured logs with requestId and source.
  - Security: Server holds NOTION_API_KEY; CORS restricted via CORS_ORIGIN.
  - Deployability: Vercel Node v3 (and Edge if applicable), Bun local dev.
- Acceptance Criteria
  - Articles endpoints function against at least one configured source.
  - Correct mapping of system fields and logical fields; warnings surfaced when present.
  - Request validation rejects invalid payloads; responses conform to schemas.
  - Deleting archives the Notion page.
  - Observability: logs include requestId and source; errors contain normalized envelope.

Architecture
- Pattern Overview
  - Virtual Table per kind: defines a logical schema and capabilities for each kind (articles implemented; changelog, projects planned).
  - Repository per database: each source alias maps to a specific Notion databaseId and adapter implementing logical<->Notion mapping. No cross-source aggregation by default.
- Components
  - Domain Schemas (Effect Schema):
    - BaseEntity: common logical fields.
    - ListParams: filter, sort, pagination schema.
    - Per-kind aliases: Article, Changelog, Project = BaseEntity for now.
  - Adapter Interface (per kind)
    - toNotionQuery: converts logical filters/sorts to Notion database.query payload.
    - fromNotionPage: converts Notion page to logical entity (maps system fields).
    - toNotionProperties: converts logical create/update patch to Notion properties.
    - Optional content mappers (to/from blocks) if your content endpoints exist.
  - Repository (per kind)
    - list/getById/create/update/delete delegating to Notion client and adapter.
    - delete uses archive semantics (Notion pages.update { archived: true }).
  - Registry
    - Maps (kind, sourceAlias) -> { databaseId, adapter, capabilities }.
  - Router
    - ArticlesRouter implemented: /api/articles/list|get|create|update|delete. Requires source alias.
    - Input validated via schemas; outputs validated in development or behind a flag.
  - Notion Client
    - Thin wrapper around official Notion SDK or fetch with typed methods (databases.query, pages.retrieve, pages.create, pages.update).
  - Error Handling and Logging
    - Use existing middleware; include source and databaseId in logs and error details.
- Data Mapping Details
  - System Fields:
    - createdAt: page.created_time
    - updatedAt: page.last_edited_time
    - createdBy: page.created_by.name || id
    - updatedBy: page.last_edited_by.name || id
  - Properties (example logical -> Notion):
    - name: Title property “Name” (configurable per adapter)
    - description: Rich text property “Description”
    - type: Select “Type”
    - tags: Multi-select “Tags”
    - status: Select “Status”
    - publishedAt: Date “Published_at”
  - Identity:
    - logical id = `${source}_${page.id}`, surface pageId and databaseId.
- Pagination
  - Directly expose Notion’s next_cursor as nextCursor.
  - No merged cross-source pagination.
- Performance/Concurrency
  - Use Effect for timeouts/retries. Page sizes <= 50 by default, configurable to 100.
  - Optional small TTL caching per (source, query-hash) if needed later.
- Configuration
  - Env variables for each source databaseId, e.g.:
    - NOTION_DB_ARTICLES_BLOG, NOTION_DB_ARTICLES_HANDBOOK
  - Registry constructed at startup from envs.
- Security
  - NOTION_API_KEY only on server. CORS via CORS_ORIGIN. No client secrets.

Implementation Plan
- Milestone 1: Domain and Contracts
  1) Add src/domain/logical/Common.ts with BaseEntity and ListParams.
  2) Add src/domain/adapters/Adapter.ts with EntityAdapter<E>.
  3) Add src/domain/repo/Repository.ts with generic Repository<E>.
  4) Add src/domain/registry/sources.ts with registry scaffolding and helpers.
- Milestone 2: Articles Path (reference implementation)
  1) Implement one concrete adapter for articles (e.g., blogArticleAdapter) mapping:
     - Name -> Title “Name”
     - Description -> Rich text “Description”
     - Type -> Select “Type”
     - Tags -> Multi-select “Tags”
     - Status -> Select “Status”
     - Published_at -> Date “Published_at”
     - System fields for createdAt/updatedAt/createdBy/updatedBy.
  2) Implement makeArticlesRepository(notion, source).
  3) Add ArticlesRouter with endpoints:
     - POST /api/articles/list
     - GET /api/articles/get
     - POST /api/articles/create
     - POST /api/articles/update
     - POST /api/articles/delete (archive)
  4) Wire into src/router.ts (compose routers).
  5) Update api/index.ts adapter to route new paths, keep logging + CORS.
- Milestone 3: Changelog and Projects
  1) Copy the Articles adapter and tweak property names for each source.
  2) Implement repositories and routers for changelog and projects similarly.
  3) Add sources to registry for these kinds.
- Milestone 4: Validation, Errors, and Observability
  1) Validate request bodies with schemas on each route.
  2) Optionally validate responses in dev; log discrepancies.
  3) Ensure errors include source, databaseId, requestId. Add warnings array for partial issues if needed.
- Milestone 5: Delete semantics and Patch fidelity
  1) Implement delete as archive: pages.update({ page_id, archived: true }).
  2) Ensure update patches are partial and never clobber unspecified fields.
- Milestone 6: Performance + Limits
  1) Enforce pageSize bounds (1–100); default 20 or 50.
  2) Add Effect Schedule timeout/retry for Notion calls (e.g., 10s timeout, 2 retries with jitter).
  3) Confirm memory footprint on Vercel Node with 2 GB; avoid large in-memory accumulations.
- Milestone 7: Documentation and Examples
  1) Update README with multi-kind, multi-source usage:
     - Add source param examples.
     - Document endpoints per kind.
  2) Provide curl examples for each endpoint and kind.
  3) Document env variables and registry setup.
- Milestone 8: Tests
  1) Add integration tests hitting a test Notion workspace with two sources for articles.
  2) Test list pagination, create, update, delete (archive).
  3) Test schema validation rejections and error envelopes.

Key Files (full-file templates)
- src/domain/logical/Common.ts
```ts
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
})
export type BaseEntity = Schema.Schema.Type<typeof BaseEntity>

export const ListParams = Schema.Struct({
  source: Schema.String,
  pageSize: Schema.Number.pipe(Schema.Int(), Schema.Between(1, 100)).withDefault(
    () => 20
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
```

- src/domain/adapters/Adapter.ts
```ts
import type { BaseEntity, ListParams } from "../logical/Common"

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
```

- src/domain/registry/sources.ts
```ts
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
```

- src/services/ArticlesRepository.ts
```ts
import { Effect } from "effect"
import type { BaseEntity, ListParams } from "../domain/logical/Common"
import type { SourceConfig } from "../domain/registry/sources"

type NotionClient = {
  databases: {
    query: (args: {
      database_id: string
      filter?: any
      sorts?: any[]
      page_size?: number
      start_cursor?: string
    }) => Promise<{
      results: any[]
      has_more: boolean
      next_cursor: string | null
    }>
  }
  pages: {
    retrieve: (args: { page_id: string }) => Promise<any>
    create: (args: {
      parent: { database_id: string }
      properties: Record<string, any>
      children?: any[]
    }) => Promise<{ id: string }>
    update: (args: {
      page_id: string
      properties?: Record<string, any>
      archived?: boolean
    }) => Promise<any>
  }
}

export function makeArticlesRepository(
  notion: NotionClient,
  source: SourceConfig
) {
  const adapter = source.adapter as any

  const list = (params: ListParams) =>
    Effect.tryPromise(async () => {
      const q = adapter.toNotionQuery({
        databaseId: source.databaseId,
        params,
      })
      const res = await notion.databases.query({
        database_id: source.databaseId,
        filter: q.filter,
        sorts: q.sorts,
        page_size: q.page_size,
        start_cursor: q.start_cursor,
      })
      const results = res.results.map((page: any) =>
        adapter.fromNotionPage({
          source: source.alias,
          databaseId: source.databaseId,
          page,
        })
      )
      return {
        results,
        has_more: res.has_more,
        next_cursor: res.next_cursor,
      }
    }).pipe(
      Effect.map((x) => ({
        results: x.results,
        hasMore: x.has_more,
        nextCursor: x.next_cursor,
      }))
    )

  const getById = (args: { pageId: string }) =>
    Effect.tryPromise(async () => {
      const page = await notion.pages.retrieve({ page_id: args.pageId })
      return adapter.fromNotionPage({
        source: source.alias,
        databaseId: source.databaseId,
        page,
      })
    })

  const create = (args: {
    data: Omit<BaseEntity, "id" | "pageId" | "databaseId" | "source">
  }) =>
    Effect.tryPromise(async () => {
      const props = adapter.toNotionProperties({ patch: args.data })
      const result = await notion.pages.create({
        parent: { database_id: source.databaseId },
        properties: props,
      })
      return {
        id: `${source.alias}_${result.id}`,
        pageId: result.id,
      }
    })

  const update = (args: {
    pageId: string
    patch: Partial<Omit<BaseEntity, "id" | "source" | "pageId" | "databaseId">>
  }) =>
    Effect.tryPromise(async () => {
      const props = adapter.toNotionProperties({ patch: args.patch })
      await notion.pages.update({
        page_id: args.pageId,
        properties: props,
      })
    })

  const del = (args: { pageId: string }) =>
    Effect.tryPromise(async () => {
      await notion.pages.update({
        page_id: args.pageId,
        archived: true,
      })
    })

  return { kind: "articles" as const, list, getById, create, update, delete: del }
}
```

- src/domain/adapters/articles/blog.adapter.ts (example)
```ts
import type { EntityAdapter } from "../../adapters/Adapter"
import type { BaseEntity } from "../../logical/Common"

const P = {
  name: "Name",
  description: "Description",
  type: "Type",
  tags: "Tags",
  status: "Status",
  publishedAt: "Published_at",
}

export const blogArticleAdapter: EntityAdapter<BaseEntity> = {
  toNotionQuery: ({ params }) => {
    const and: any[] = []

    if (params.filter?.statusEquals) {
      and.push({ property: P.status, select: { equals: params.filter.statusEquals } })
    }
    if (params.filter?.typeEquals) {
      and.push({ property: P.type, select: { equals: params.filter.typeEquals } })
    }
    if (params.filter?.tagIn && params.filter.tagIn.length > 0) {
      and.push(
        ...params.filter.tagIn.map((t) => ({
          property: P.tags,
          multi_select: { contains: t },
        }))
      )
    }
    if (params.filter?.publishedAfter) {
      and.push({
        property: P.publishedAt,
        date: { on_or_after: params.filter.publishedAfter.toISOString() },
      })
    }
    if (params.filter?.publishedBefore) {
      and.push({
        property: P.publishedAt,
        date: { on_or_before: params.filter.publishedBefore.toISOString() },
      })
    }

    const filter = and.length ? { and } : undefined

    const sort =
      params.sort?.key === "name"
        ? { property: P.name, direction: params.sort.direction }
        : params.sort?.key === "publishedAt"
        ? { property: P.publishedAt, direction: params.sort.direction }
        : params.sort?.key === "updatedAt"
        ? { timestamp: "last_edited_time", direction: params.sort.direction }
        : { timestamp: "created_time", direction: params?.sort?.direction ?? "descending" }

    return {
      filter,
      sorts: [sort],
      page_size: params.pageSize,
      start_cursor: params.startCursor,
    }
  },

  fromNotionPage: ({ source, databaseId, page }) => {
    const props = page.properties

    const text = (p: any) =>
      p?.title?.map((t: any) => t.plain_text).join("") ??
      p?.rich_text?.map((r: any) => r.plain_text).join("") ??
      ""

    const select = (p: any) => p?.select?.name ?? undefined
    const multi = (p: any) => (p?.multi_select ?? []).map((t: any) => t.name)
    const date = (p: any) => (p?.date?.start ? new Date(p.date.start) : undefined)

    return {
      id: `${source}_${page.id}`,
      source,
      pageId: page.id,
      databaseId,

      name: text(props[P.name]),
      description: props[P.description] ? text(props[P.description]) : undefined,

      createdAt: new Date(page.created_time),
      updatedAt: new Date(page.last_edited_time),
      createdBy:
        page.created_by && typeof page.created_by === "object"
          ? page.created_by.name ?? page.created_by.id
          : undefined,
      updatedBy:
        page.last_edited_by && typeof page.last_edited_by === "object"
          ? page.last_edited_by.name ?? page.last_edited_by.id
          : undefined,

      type: select(props[P.type]),
      tags: multi(props[P.tags]),
      status: select(props[P.status]),
      publishedAt: date(props[P.publishedAt]),
    } as BaseEntity
  },

  toNotionProperties: ({ patch }) => {
    const props: Record<string, any> = {}

    if (patch.name !== undefined) {
      props[P.name] = { title: [{ type: "text", text: { content: patch.name } }] }
    }
    if (patch.description !== undefined) {
      props[P.description] = {
        rich_text: [{ type: "text", text: { content: patch.description ?? "" } }],
      }
    }
    if (patch.type !== undefined) {
      props[P.type] = patch.type ? { select: { name: patch.type } } : { select: null }
    }
    if (patch.tags !== undefined) {
      props[P.tags] = {
        multi_select: (patch.tags ?? []).map((t) => ({ name: t })),
      }
    }
    if (patch.status !== undefined) {
      props[P.status] = patch.status
        ? { select: { name: patch.status } }
        : { select: null }
    }
    if (patch.publishedAt !== undefined) {
      props[P.publishedAt] = patch.publishedAt
        ? { date: { start: patch.publishedAt.toISOString() } }
        : { date: null }
    }

    return props
  },
}
```

- src/router/articles.ts (pattern; replicate for changelog, projects)
```ts
import { HttpRouter, HttpServerResponse } from "@effect/platform"
import { Effect, Schema } from "effect"
import { ListParams } from "../domain/logical/Common"
import { Sources } from "../domain/registry/sources"
import { makeArticlesRepository } from "../services/ArticlesRepository"

const QueryGet = Schema.Struct({
  source: Schema.String,
  pageId: Schema.String,
})

const BodyCreate = Schema.Struct({
  source: Schema.String,
  data: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
})

const BodyUpdate = Schema.Struct({
  source: Schema.String,
  pageId: Schema.String,
  patch: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
})

const BodyDelete = Schema.Struct({
  source: Schema.String,
  pageId: Schema.String,
})

export const ArticlesRouter = HttpRouter.router.empty.pipe(
  HttpRouter.post(
    "/api/articles/list",
    HttpRouter.schemaBody(ListParams),
    HttpRouter.handler(({ body, services }) =>
      Effect.gen(function* () {
        const source = Sources.resolve("articles", body.source)
        const notion = yield* services.get("NotionClient")
        const repo = makeArticlesRepository(notion, source)
        const data = yield* repo.list(body)
        return HttpServerResponse.json(data, { status: 200 })
      })
    )
  ),
  HttpRouter.get(
    "/api/articles/get",
    HttpRouter.schemaQuery(QueryGet),
    HttpRouter.handler(({ query, services }) =>
      Effect.gen(function* () {
        const source = Sources.resolve("articles", query.source)
        const notion = yield* services.get("NotionClient")
        const repo = makeArticlesRepository(notion, source)
        const item = yield* repo.getById({ pageId: query.pageId })
        return HttpServerResponse.json(item, { status: 200 })
      })
    )
  ),
  HttpRouter.post(
    "/api/articles/create",
    HttpRouter.schemaBody(BodyCreate),
    HttpRouter.handler(({ body, services }) =>
      Effect.gen(function* () {
        const source = Sources.resolve("articles", body.source)
        const notion = yield* services.get("NotionClient")
        const repo = makeArticlesRepository(notion, source)
        const res = yield* repo.create({ data: body.data as any })
        return HttpServerResponse.json(res, { status: 201 })
      })
    )
  ),
  HttpRouter.post(
    "/api/articles/update",
    HttpRouter.schemaBody(BodyUpdate),
    HttpRouter.handler(({ body, services }) =>
      Effect.gen(function* () {
        const source = Sources.resolve("articles", body.source)
        const notion = yield* services.get("NotionClient")
        const repo = makeArticlesRepository(notion, source)
        yield* repo.update({ pageId: body.pageId, patch: body.patch as any })
        return HttpServerResponse.json({ ok: true }, { status: 200 })
      })
    )
  ),
  HttpRouter.post(
    "/api/articles/delete",
    HttpRouter.schemaBody(BodyDelete),
    HttpRouter.handler(({ body, services }) =>
      Effect.gen(function* () {
        const source = Sources.resolve("articles", body.source)
        const notion = yield* services.get("NotionClient")
        const repo = makeArticlesRepository(notion, source)
        yield* repo.delete({ pageId: body.pageId })
        return HttpServerResponse.json({ ok: true }, { status: 200 })
      })
    )
  )
)
```

Operational Tips
- Use Notion SDK or fetch with proper headers; wrap in Effect for retry/timeout.
- Ensure CORS and logging middleware run for new paths.
- Add per-kind adapters and registry entries gradually; start with articles.

Open Questions (quick confirmations)
- Property names for Description/Type/Tags/Status/Published_at per source may differ; do you want to pass those via environment-configured adapters, or hardcode per adapter module?
- For people fields, do you want to expose Notion user name, email, or id? I suggest name || id to avoid requiring People read scope for emails.

If you share the actual property names for your first two sources per kind, I can provide exact adapter files for each and a ready-to-run sources registry file.