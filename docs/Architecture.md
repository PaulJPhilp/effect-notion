
Architecture
- Pattern Overview
  - Virtual Table per kind: defines a logical schema and capabilities for each kind (articles, changelog, projects).
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
    - Three routers: ArticlesRouter, ChangelogRouter, ProjectsRouter.
    - Endpoints: /api/{kind}/list|get|create|update|delete. Require source alias.
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
    - NOTION_DB_CHANGELOG_MAIN, NOTION_DB_PROJECTS_MAIN, etc.
  - Registry constructed at startup from envs.
- Security
  - NOTION_API_KEY only on server. CORS via CORS_ORIGIN. No client secrets.

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