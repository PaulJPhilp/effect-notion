
Architecture
- Pattern Overview
  - Virtual Table per kind: defines a logical schema and capabilities for each kind (Articles implemented; Changelog and Projects planned).
  - Repository per database: each source alias maps to a specific Notion databaseId and adapter implementing logical<->Notion mapping. No cross-source aggregation by default.
- Components
  - Domain Schemas (Effect Schema):
    - BaseEntity: common logical fields (includes optional `warnings`).
    - ListParams: filter, sort, pagination schema.
    - Per-kind aliases: Article, Changelog, Project = BaseEntity for now.
  - Adapter Interface (per kind)
    - toNotionQuery: converts logical filters/sorts to Notion database.query payload.
    - fromNotionPage: converts Notion page to logical entity (maps system fields).
    - toNotionProperties: converts logical create/update patch to Notion properties.
    - Optional content mappers (to/from blocks) if your content endpoints exist.
  - Repository (per kind)
    - list/get/create/update/delete delegating to Notion client and adapter.
    - delete uses archive semantics (Notion pages.update { archived: true }).
  - Registry
    - Maps (kind, sourceAlias) -> { databaseId, adapter, capabilities }.
    - Implemented via env-driven loader: `NOTION_DB_ARTICLES_BLOG` -> alias `blog` for kind `articles`.
  - Router
    - ArticlesRouter implemented: /api/articles/list|get|create|update|delete. Requires `source`.
    - Backward-compatible endpoints retained: /api/list-articles, /api/get-database-schema, /api/get-article-metadata, /api/get-article-content, /api/update-article-content.
    - Input validated via schemas; outputs validated where applicable.
  - Notion Client
    - Thin wrapper around Notion HTTP API using `@effect/platform` HttpClient with retry.
  - Notion Service
    - Normalizes database schema and caches per database for 10 minutes.
    - Provides list helpers (pages or identifiers) and content read/write with batching and retries.
  - Error Handling and Logging
    - Normalized error envelope with `x-request-id` header; structured logging at router and services.
- Data Mapping Details
  - System Fields:
    - createdAt: page.created_time
    - updatedAt: page.last_edited_time
    - createdBy: page.created_by.name || id
    - updatedBy: page.last_edited_by.name || id
  - Properties (example logical -> Notion):
    - name: Title property (adapter-configurable, e.g., "Title" or "Name")
    - description: Rich text property
    - type: Select
    - tags: Multi-select
    - status: Select
    - publishedAt: Date
  - Identity:
    - logical id = `${source}_${page.id}`, plus `pageId` and `databaseId`.
  - Warnings:
    - Non-fatal adapter decode/encode notes are surfaced via optional `warnings: string[]`.
- Pagination
  - Directly expose Notion’s `next_cursor` as `nextCursor`.
  - No merged cross-source pagination.
- Performance/Concurrency
  - Effect-based timeouts/retries in HTTP client.
  - NotionService caches normalized schemas with TTL; logs schema changes.
- Configuration
  - Env variables per source (current): `NOTION_DB_ARTICLES_BLOG`.
  - Extend by adding more aliases and adapters.
- Security
  - `NOTION_API_KEY` only on server. CORS via `CORS_ORIGIN`. No client secrets.

Modular Services Structure
- Each service under `src/services/` lives in its own folder with a
  consistent layout:
  - `api.ts` — public service interface and Effect tag.
  - `types.ts` — service-specific types (DTOs, params, results).
  - `errors.ts` — typed errors (`Data.TaggedError`) if applicable.
  - `helpers.ts` — pure helpers, data transforms, logging helpers.
  - `service.ts` — concrete `Effect.Service` implementation and `.Default`
    layer including dependencies.
  - `__tests__/` — colocated tests for the service.

- Backward compatibility is preserved via re-exports:
  - `src/ServiceName.ts` re-exports from `src/services/ServiceName/service.ts`.
  - `src/services/ServiceName.ts` (legacy path) also re-exports to the new
    implementation. This allows incremental migration.

Import Conventions (TypeScript NodeNext)
- The project uses `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`,
  and `"verbatimModuleSyntax": true`.
- Runtime imports must use `.js` extensions, e.g.:
  - `import { NotionService } from "./services/NotionService.js"`
- Type-only imports may use `.ts` extensions to satisfy the compiler while
  emitting no code, e.g.:
  - `import type { ListResult } from "./types.ts"`
- Do not omit extensions. Keep `.js` for values at runtime and use `.ts` for
  type-only imports.