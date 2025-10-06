# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`effect-notion` is a secure Notion API proxy server built with Effect-TS. It acts as a backend bridge between front-end applications and Notion, providing type-safe operations, schema validation, logical field mapping, and production-ready observability.

## Commands

### Development
- `bun run dev` - Start development server with watch mode
- `bun start` - Run production server locally
- `bun run build` - Type-check with TypeScript (no emit)
- `bun run typecheck` - Same as build (alias)

### Testing
- `bun test` - Run all tests (uses Vitest via Bun)
- `bun test <file>` - Run specific test file
- `bun test --watch` - Watch mode
- `bun run test:coverage` - Generate coverage report

### Code Quality
- `bunx @biomejs/biome check .` - Lint and format check
- `bunx @biomejs/biome check --apply .` - Auto-fix lint/format issues
- `bunx @biomejs/biome format --write .` - Format all files

### Utilities
- `bun scripts/diagnose.ts <path> [method] [body]` - Test endpoints locally with detailed logging
- `bun scripts/generate-notion-schema.ts --databaseId <id> [--emitEffectSchema]` - Generate TypeScript types from live Notion database

## Architecture

### Effect-TS Service Patterns

All application logic follows strict Effect-TS patterns:

- **Services as Context.Tag**: All dependencies (NotionClient, NotionService, ArticlesRepository) are defined as Effect services
- **Layer-based DI**: Dependencies are composed via Layers in `api/index.ts`
- **Immutable State**: No global mutable state; uses FiberRef (RequestIdService) and Ref for concurrent-safe state
- **Tagged Errors**: All errors use `Data.TaggedError` for exhaustive type-safe handling
- **Effect.gen**: All async operations use `Effect.gen(function* () { ... })` - never use Promises directly in domain code
- **Effect.all for concurrency**: Parallel operations use `Effect.all` with explicit concurrency control

### Service Structure

Services live in `src/services/<ServiceName>/` with this layout:
```
src/services/NotionService/
├── api.ts         # Public interface + Context.Tag
├── types.ts       # Request/response types
├── errors.ts      # Tagged error types (optional)
├── helpers.ts     # Pure utility functions
├── service.ts     # Implementation + .Default layer
└── __tests__/     # Colocated tests
```

Backward compatibility: `src/services/<ServiceName>.ts` re-exports from `service.ts`.

### Key Services

- **AppConfig**: Configuration via Effect Config (env vars with validation)
- **RequestIdService**: Request correlation IDs using FiberRef for logging context
- **NotionClient**: Low-level Notion API client with retry policies (Effect.retry + Schedule)
- **NotionService**: Business logic with LRU caching (max 100 entries, 10min TTL, stale fallback)
- **ArticlesRepository**: High-level CRUD with distributed tracing (Effect.withSpan)

### Request Flow

```
[User Request]
  → api/index.ts (Vercel adapter: OPTIONS fast-path, CORS, logging)
  → src/router.ts (HttpRouter with typed routes)
  → Route handler (schemaBodyJson/schemaSearchParams validation)
  → Service layer (NotionService, ArticlesRepository)
  → NotionClient (Notion API with retry)
  → [Response with x-request-id header]
```

### Error Handling

All errors are caught in `src/router.ts` via `HttpRouter.catchTags`:
- `ParseError` → 400 Bad Request (schema validation)
- `BadRequestError` → 400
- `InvalidApiKeyError` → 401 Unauthorized
- `NotFoundError`, `SourceNotFoundError` → 404
- `InternalServerError` → 500
- Final `catchAll` ensures no errors escape

Every error response includes:
```json
{
  "error": "Error Name",
  "code": "ErrorCode",
  "requestId": "abc123",
  "detail": "Human-friendly message",
  "errors": ["Optional validation errors"]
}
```

### Schema-Driven Adapters

Adapters map Notion property bags to domain entities using Effect Schema:

1. **Define domain shape** with Effect Schema types
2. **Annotate Notion property names** via `defineDomainWithNotion(shape, propertyMap)`
3. **Provide codecs** for each field (helpers in `src/domain/adapters/schema/Codecs.ts`)
4. **Build config** with `makeConfigFromAnnotations(ann, codecs)`
5. **Decode/encode** using `S.decodeEither`/`S.encodeEither`

Example adapters: `src/domain/adapters/articles/blog.adapter.ts`

See `docs/SchemaAdapter.md` for details on adding new field mappings.

### Module Resolution (TypeScript NodeNext)

**Critical**: This project uses `"moduleResolution": "NodeNext"` with `"verbatimModuleSyntax": true`:

- **Runtime imports**: Always use `.js` extension (even for `.ts` files)
  ```typescript
  import { foo } from "./service.js";  // ✅ Correct
  import { foo } from "./service";     // ❌ Wrong
  ```
- **Type-only imports**: Use `.ts` extension
  ```typescript
  import type { Foo } from "./types.ts";  // ✅ Correct
  ```

This is enforced by TypeScript and will cause build errors if violated.

## Source Configuration

Sources are defined in `sources.config.json` (JSON configuration with environment variable substitution):

**Default location:** `./sources.config.json`
**Override:** Set `NOTION_SOURCES_CONFIG` environment variable

**Structure:**
```json
{
  "version": "1.0",
  "sources": [
    {
      "alias": "blog",
      "kind": "articles",
      "databaseId": "${NOTION_DB_ARTICLES_BLOG}",
      "adapter": "blog",
      "capabilities": {"update": true, "delete": true},
      "description": "Public blog posts"
    }
  ]
}
```

**Adding a source:**
1. Add database ID to `.env`: `NOTION_DB_ARTICLES_HANDBOOK=...`
2. Add source entry to `sources.config.json`
3. Create adapter if custom mapping needed (optional)
4. Register adapter in `src/domain/adapters/registry.ts` (if custom)

**Startup logs:**
```
[Sources] Loaded 2 source(s):
  - articles/blog (update=true, delete=true) - Public blog posts
  - articles/handbook (update=false, delete=false) - Internal handbook
```

See `docs/SOURCES_CONFIG.md` for complete configuration reference.

## Environment Variables

Required:
- `NOTION_API_KEY` - Notion integration key (never expose client-side)

Optional:
- `NODE_ENV` - development | test | production (default: development)
- `PORT` - Local server port (default: 3000)
- `LOG_LEVEL` - Debug | Info | Warning | Error (default: Info)
- `CORS_ORIGIN` - Allowed origin(s) (default: *)
- `CORS_ALLOWED_METHODS` - Comma-separated methods (default: POST,GET,OPTIONS)
- `CORS_ALLOWED_HEADERS` - Comma-separated headers (default: Content-Type,Authorization)
- `NOTION_SOURCES_CONFIG` - Path to sources config file (default: ./sources.config.json)
- `NOTION_DB_ARTICLES_BLOG` - Database ID for blog article source
- `NOTION_DB_ARTICLES_*` - Additional article source database IDs

Env file precedence (later overrides earlier):
1. `.env`
2. `.env.local`
3. `.env.$NODE_ENV`
4. `.env.$NODE_ENV.local`

## Testing Conventions

- **Integration tests**: `test/*.integration.test.ts` - uses live Notion API (requires env vars)
- **Unit tests**: `test/*.test.ts` - pure logic, no external dependencies
- **Endpoint tests**: `test/*.endpoint.test.ts` - router tests via Effect runtime

Test layer composition:
```typescript
const TestLayer = Layer.mergeAll(
  Logger.json,
  AppConfigProviderLive,
  NotionClient.Default,
  NotionService.Default
);
```

Coverage thresholds: 60% lines, 60% functions, 50% branches.

## Code Quality Rules

### Effect-TS Strictness

1. **Never use Promises** in domain/service code - always use Effect
   - ❌ `async/await`, `Promise.resolve()`, `Promise.reject()`
   - ✅ `Effect.gen`, `Effect.succeed`, `Effect.fail`

2. **Never throw** in Effect code paths
   - ❌ `throw new Error()`, `throw new TypeError()`
   - ✅ `Effect.fail(new TaggedError({ ... }))`

3. **Never use try/catch** in Effect code
   - ❌ `try { ... } catch (e) { ... }`
   - ✅ `Effect.catchTags({ ErrorName: ... })`, `Effect.catchAll`

4. **Use Clock service** for time operations (deterministic testing)
   - ❌ `Date.now()`, `new Date()`
   - ✅ `yield* Clock.currentTimeMillis`

5. **Use Effect.log** for logging (structured, fiber-aware)
   - ❌ `console.log()`
   - ✅ `yield* Effect.logInfo("message")`

### TypeScript Strictness (tsconfig.json)

- `"strict": true`
- `"noUncheckedIndexedAccess": true` - all index access returns `T | undefined`
- `"exactOptionalPropertyTypes": true` - strict optional property handling
- `"noImplicitOverride": true`
- `"isolatedModules": true`
- `"verbatimModuleSyntax": true`

### Biome Rules

- No `any` types (`suspicious/noExplicitAny`)
- No unhandled promises (`suspicious/noFloatingPromises`)
- Prefer `import type` for types (`typescript/useImportType`)
- Use `const` over `let` where possible
- No `as any` or `as unknown as T` casts (use `satisfies` instead)
- No `// @ts-ignore` (must be justified)

## Common Patterns

### Adding a New Route

1. Define request/response schemas in `src/schema.ts` using Effect Schema
2. Create handler in `src/router.ts` or `src/router/<feature>.ts`
3. Use `HttpServerRequest.schemaBodyJson` or `schemaSearchParams` for validation
4. Extract and set request ID for logging correlation
5. Add error handling tags in router's `catchTags`

### Adding a New Service

1. Create `src/services/<ServiceName>/` directory
2. Define API in `api.ts` with `Context.Tag`
3. Implement in `service.ts` with `.Default` Layer export
4. Add to `AppLayers` in `api/index.ts`
5. Add backward-compatible re-export in `src/services/<ServiceName>.ts`

### Adding Schema Fields

1. Pick or create codec in `src/domain/adapters/schema/Codecs.ts`
2. Extend domain `shape` with new field (use `S.optional` for nullable)
3. Add Notion property name to `defineDomainWithNotion` annotations
4. Add codec to codec map
5. Config is auto-generated from annotations + codecs

### Using Metrics

View metrics: `curl http://localhost:3000/api/metrics`

Add custom metrics:
```typescript
const myCounter = Metric.counter("my_feature_operations");
yield* Metric.increment(myCounter);
```

### Request ID Correlation

Every request gets a unique ID automatically:
```typescript
// Extract and store in FiberRef
const requestId = getRequestId(req.headers);
yield* setCurrentRequestId(requestId);

// Automatically included in all Effect.log calls
yield* Effect.logInfo("processing"); // {"requestId":"abc123",...}

// Add to response headers
return yield* HttpServerResponse.json(data).pipe(
  Effect.map((res) =>
    HttpServerResponse.setHeaders(
      addRequestIdToHeaders(res.headers, requestId)
    )(res)
  )
);
```

## Deployment

### Vercel (Recommended)

Project is configured for Vercel with Node.js runtime (see `vercel.json`):
- Entry point: `api/index.ts`
- Runtime: `@vercel/node@3.2.20`
- All routes go through Effect router (no bypasses)

Deploy: `vercel --prod`

**Important**: Set all required environment variables in Vercel dashboard.

### Local Development

Uses Bun for speed, but production uses Node.js for Vercel compatibility.

## Troubleshooting

### "Module not found" errors
- Check `.js` extensions in imports (required for NodeNext)
- Run `bun run typecheck` to validate

### "Layer not provided" errors
- Ensure service Layer is in `AppLayers` in `api/index.ts`

### Integration tests fail with NotFoundError
- Verify `NOTION_API_KEY` and database IDs in `.env`
- Check Notion integration has access to databases

### Stale cached data
- Cache TTL is 10 minutes
- Restart server to clear all caches
- Cache is bounded to 100 entries with LRU eviction

## Additional Documentation

- **Architecture**: `docs/Architecture.md` - system design and component relationships
- **Development Guide**: `docs/DEVELOPMENT.md` - detailed development workflows
- **Production Guide**: `docs/PRODUCTION.md` - deployment and monitoring
- **Schema Adapters**: `docs/SchemaAdapter.md` - pattern for Notion↔domain mapping
- **Metrics**: `docs/METRICS_AND_RESILIENCE.md` - observability and error handling
