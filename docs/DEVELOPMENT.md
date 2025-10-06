# Development Guide

This guide covers development workflows, architecture patterns, and best practices for contributing to effect-notion.

## Table of Contents

- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Architecture Patterns](#architecture-patterns)
- [Testing](#testing)
- [Common Tasks](#common-tasks)
- [Troubleshooting](#troubleshooting)

## Getting Started

### Prerequisites

- Bun 1.0+ (or Node.js 20+)
- TypeScript 5.6+
- Notion API integration with a test database

### Initial Setup

1. **Clone and install dependencies**
   ```bash
   git clone <repo>
   cd effect-notion
   bun install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your Notion API key and database IDs
   ```

3. **Verify setup**
   ```bash
   bun run build    # Type-check
   bun test         # Run tests
   bun run dev      # Start dev server
   ```

## Project Structure

```
effect-notion/
├── api/                    # Vercel deployment adapters
│   └── index.ts           # Vercel handler with CORS/logging
├── src/
│   ├── config.ts          # App configuration with Effect Config
│   ├── errors.ts          # Global error types
│   ├── router.ts          # Main HTTP router with error handling
│   ├── schema.ts          # API request/response schemas
│   ├── domain/            # Domain logic
│   │   ├── adapters/      # Notion ↔ Domain adapters
│   │   │   ├── articles/  # Article-specific adapters
│   │   │   └── schema/    # Schema transformation helpers
│   │   ├── logical/       # Domain entity types
│   │   └── registry/      # Source configuration registry
│   ├── http/              # HTTP utilities
│   │   └── requestId.ts   # Request ID correlation
│   ├── router/            # Route handlers by feature
│   │   ├── articles.ts    # Articles CRUD endpoints
│   │   └── simpleMetrics.ts # Metrics endpoint
│   ├── services/          # Effect services
│   │   ├── NotionClient/  # Low-level Notion API client
│   │   ├── NotionService/ # Business logic + caching
│   │   └── ArticlesRepository/ # High-level CRUD
│   └── main.ts            # Local server entry
├── test/                  # Test suites
├── scripts/               # Development utilities
└── docs/                  # Documentation
    └── archive/           # Historical phase documents
```

## Architecture Patterns

### Effect-TS Services

All dependencies are modeled as Effect services following these patterns:

**Service Structure:**
```
src/services/<ServiceName>/
├── api.ts         # Public interface + Effect tag
├── types.ts       # Request/response types
├── errors.ts      # Tagged error types (optional)
├── helpers.ts     # Pure utility functions
├── service.ts     # Implementation + .Default layer
└── __tests__/     # Colocated tests
```

**Example Service Definition:**
```typescript
// api.ts
export class MyService extends Context.Tag("MyService")<
  MyService,
  {
    readonly doSomething: (id: string) => Effect.Effect<Result, MyError>
  }
>() {}

// service.ts
export const MyServiceLive = Layer.effect(
  MyService,
  Effect.gen(function* () {
    const dependency = yield* OtherService;

    return {
      doSomething: (id) =>
        Effect.gen(function* () {
          // Implementation
        }),
    };
  })
);

// Export for convenience
export const Default = MyServiceLive;
```

### Layer Composition

Layers are composed in `api/index.ts`:

```typescript
const AppLayers = Layer.mergeAll(
  Logger.json,
  LogLevelLayer,
  AppConfigProviderLive,
  RequestIdService.Live,
  NotionClient.Default,      // Provides NotionClient
  NotionService.Default,     // Depends on NotionClient
  ArticlesRepository.Default, // Depends on NotionService
  HttpServer.layerContext
);
```

### Error Handling

All errors use tagged errors for type-safe handling:

```typescript
// Define error
export class MyError extends Data.TaggedError("MyError")<{
  readonly detail: string
}> {}

// Use in service
Effect.fail(new MyError({ detail: "Something went wrong" }))

// Handle in router
HttpRouter.catchTags({
  MyError: (e) =>
    Effect.gen(function* () {
      yield* Effect.logWarning(`MyError: ${e.detail}`);
      return yield* badRequest({ detail: e.detail });
    }),
})
```

### Schema-Driven Adapters

Adapters transform between Notion's property format and domain entities using Effect Schema:

```typescript
// Domain shape
const shape = {
  name: S.String,
  status: S.optional(S.String),
  publishedAt: S.optional(S.Date),
};

// Notion property annotations
const ann = defineDomainWithNotion(shape, {
  name: "Title",
  status: "Status",
  publishedAt: "Published Date",
});

// Type-safe codecs for each field
const codecs = {
  name: PlainTextFromTitle,
  status: SelectCodec,
  publishedAt: DateFromNotionDate,
};

const config = makeConfigFromAnnotations(ann, codecs);
```

See `docs/SchemaAdapter.md` for details.

### Caching Strategy

NotionService implements LRU caching with TTL:

- **Cache Size:** Max 100 database schemas
- **TTL:** 10 minutes
- **Eviction:** Least recently used (LRU)
- **Stale Fallback:** Serves stale cache on API errors

```typescript
// Cache entry structure
type CacheEntry = {
  schema: NormalizedDatabaseSchema;
  fetchedAt: number;
  lastAccessedAt: number;
  hits: number;
  refreshes: number;
  staleReads: number;
};
```

### Request ID Correlation

Every request gets a unique ID for log correlation:

```typescript
// Set in handler
const requestId = getRequestId(req.headers);
yield* setCurrentRequestId(requestId);

// Automatically included in logs
yield* Effect.logInfo("Processing request");
// Output: {"requestId":"abc123",...}

// Added to response headers
HttpServerResponse.setHeaders(
  addRequestIdToHeaders(response.headers, requestId)
)
```

## Testing

### Test Organization

```
test/
├── *.integration.test.ts  # Live Notion API tests
├── *.test.ts              # Unit tests
└── *.endpoint.test.ts     # Router endpoint tests
```

### Running Tests

```bash
# All tests
bun test

# Specific file
bun test test/articles.router.integration.test.ts

# With coverage
bun run test:coverage

# Watch mode
bun test --watch
```

### Test Coverage

Coverage is configured in `vitest.config.ts`:

- **Thresholds:** 60% lines, 60% functions, 50% branches
- **Reporters:** Text, JSON, HTML, LCOV
- **View HTML report:** `open coverage/index.html`

### Writing Tests

**Integration Test Pattern:**
```typescript
import { Layer } from "effect";
import { describe, expect, it } from "vitest";

const TestLayer = Layer.mergeAll(
  Logger.json,
  AppConfigProviderLive,
  NotionClient.Default,
  NotionService.Default,
  ArticlesRepository.Default
);

describe("Feature", () => {
  it("should do something", async () => {
    const result = await runEffect(
      myService.doSomething(),
      TestLayer
    );
    expect(result).toBe(expected);
  });
});
```

## Common Tasks

### Adding a New Route

1. **Define schema** in `src/schema.ts`:
   ```typescript
   export const MyRequestSchema = Schema.Struct({
     id: NotionIdSchema,
     name: NonEmptyString,
   });
   ```

2. **Create handler** in `src/router/<feature>.ts`:
   ```typescript
   HttpRouter.post(
     "/api/my-endpoint",
     Effect.gen(function* () {
       const body = yield* HttpServerRequest.schemaBodyJson(MyRequestSchema);
       const service = yield* MyService;
       const result = yield* service.process(body);
       return yield* HttpServerResponse.json(result);
     })
   )
   ```

3. **Add error handling** in `src/router.ts`:
   ```typescript
   HttpRouter.catchTags({
     MyCustomError: (e) => /* handle */,
   })
   ```

### Adding a New Service

1. **Create service directory:**
   ```bash
   mkdir -p src/services/MyService
   ```

2. **Define API** in `api.ts`:
   ```typescript
   export class MyService extends Context.Tag("MyService")<
     MyService,
     MyServiceApi
   >() {}
   ```

3. **Implement** in `service.ts`:
   ```typescript
   export const MyServiceLive = Layer.effect(
     MyService,
     Effect.gen(function* () {
       // Implementation
     })
   );
   ```

4. **Add to layers** in `api/index.ts`:
   ```typescript
   Layer.mergeAll(
     // ...existing layers,
     MyService.Live
   )
   ```

### Adding a New Adapter

1. **Define property mappings:**
   ```typescript
   const P = {
     title: "Title",
     status: "Status",
   };
   ```

2. **Create schema config builder:**
   ```typescript
   const buildSchemaConfig = () => {
     const shape = { /* domain fields */ };
     const ann = defineDomainWithNotion(shape, P);
     const codecs = { /* field codecs */ };
     return makeConfigFromAnnotations(ann, codecs);
   };
   ```

3. **Implement adapter:**
   ```typescript
   export const myAdapter: EntityAdapter<MyEntity> = {
     toNotionQuery: ({ params }) => { /* ... */ },
     fromNotionPage: ({ page }) => { /* ... */ },
     toNotionProperties: ({ patch }) => { /* ... */ },
   };
   ```

4. **Register in sources.ts:**
   ```typescript
   const MY_DB = process.env.NOTION_DB_MY_SOURCE;
   if (MY_DB) {
     out.push({
       alias: "my-source",
       databaseId: MY_DB,
       kind: "articles",
       adapter: myAdapter,
       capabilities: { update: true, delete: true },
     });
   }
   ```

### Code Generation

Generate TypeScript types from live Notion database:

```bash
bun scripts/generate-notion-schema.ts \
  --databaseId <db-id> \
  --out src/generated/my-schema.ts \
  --emitEffectSchema
```

**Outputs:**
- `src/generated/my-schema.ts` - TypeScript types
- `src/generated/my-schema.effect.ts` - Effect Schema definitions (optional)

### Metrics & Observability

**View metrics:**
```bash
curl http://localhost:3000/api/metrics
```

**Available metrics:**
- `notion_api_requests_total` - Total API requests
- `notion_api_success_total` - Successful requests
- `notion_api_errors_total` - Failed requests
- `notion_api_duration_ms` - Request duration histogram

**Add custom metrics:**
```typescript
const myCounter = Metric.counter("my_feature_operations");

yield* Metric.increment(myCounter);
```

## Troubleshooting

### Build Errors

**Issue:** TypeScript errors about missing `.js` extensions

**Solution:** Ensure all runtime imports use `.js`:
```typescript
// ✅ Correct
import { foo } from "./helpers.js";

// ❌ Wrong
import { foo } from "./helpers";
```

**Issue:** Module not found errors

**Solution:** Check `tsconfig.json` paths and verify files exist:
```bash
bun run typecheck
```

### Test Failures

**Issue:** Integration tests fail with `NotFoundError`

**Solution:** Verify environment variables are set:
```bash
# Check .env file
cat .env | grep NOTION

# Or check env vars are loaded
bun -e 'console.log(process.env.NOTION_API_KEY)'
```

**Issue:** Tests timeout

**Solution:** Increase timeout in test file:
```typescript
it("slow test", async () => {
  // test code
}, 30000); // 30 second timeout
```

### Runtime Errors

**Issue:** `Layer not provided` errors

**Solution:** Ensure all required layers are in `AppLayers`:
```typescript
const AppLayers = Layer.mergeAll(
  // Add missing layer here
  MyMissingService.Live
);
```

**Issue:** CORS errors in browser

**Solution:** Check CORS configuration in `.env`:
```bash
CORS_ORIGIN=http://localhost:3001
CORS_ALLOWED_METHODS=POST,GET,OPTIONS
CORS_ALLOWED_HEADERS=Content-Type,Authorization
```

### Cache Issues

**Issue:** Stale data being returned

**Solution:** Cache has 10-minute TTL. Force refresh by invalidating cache:
```typescript
yield* notionService.invalidateCacheForDatabase(databaseId);
```

Or restart the server to clear all caches.

**Issue:** Memory usage growing

**Solution:** Cache is bounded to 100 entries with LRU eviction. Check logs for eviction messages. If needed, reduce `MAX_CACHE_SIZE` in `src/services/NotionService/service.ts`.

### Performance Issues

**Issue:** Slow response times

**Solution:** Check metrics endpoint for bottlenecks:
```bash
curl http://localhost:3000/api/metrics | grep duration
```

Enable debug logging:
```bash
LOG_LEVEL=Debug bun run dev
```

## Best Practices

### Effect Patterns

1. **Always use Effect.gen** for readability:
   ```typescript
   // ✅ Good
   Effect.gen(function* () {
     const a = yield* getA();
     const b = yield* getB(a);
     return combine(a, b);
   })

   // ❌ Avoid
   getA().pipe(
     Effect.flatMap((a) => getB(a)),
     Effect.map((b) => combine(a, b))
   )
   ```

2. **Use tagged errors** for all failure cases:
   ```typescript
   // ✅ Good
   Effect.fail(new NotFoundError({ id }))

   // ❌ Avoid
   throw new Error("Not found")
   ```

3. **Leverage Effect.all** for concurrent operations:
   ```typescript
   // ✅ Parallel
   yield* Effect.all([fetchA(), fetchB(), fetchC()], { concurrency: 3 });

   // ❌ Sequential
   const a = yield* fetchA();
   const b = yield* fetchB();
   const c = yield* fetchC();
   ```

### Code Quality

1. **Document public APIs** with JSDoc:
   ```typescript
   /**
    * Retrieves a database schema with caching.
    *
    * @param databaseId - Notion database ID
    * @returns Effect that yields the normalized schema
    */
   getDatabaseSchema: (databaseId: string) => Effect.Effect<...>
   ```

2. **Keep functions small** (<50 lines):
   - Extract helper functions
   - Use composition over nesting

3. **Add context to errors:**
   ```typescript
   Effect.fail(new NotFoundError({
     databaseId,
     detail: `Database ${databaseId} not found in Notion workspace`
   }))
   ```

4. **Use readonly types:**
   ```typescript
   type Config = {
     readonly databaseId: string;
     readonly adapter: EntityAdapter<E>;
   };
   ```

### Testing Guidelines

1. **Test public APIs, not internals**
2. **Use descriptive test names:** "should return 404 when database not found"
3. **Arrange-Act-Assert pattern**
4. **Mock external dependencies** in unit tests
5. **Use real Notion API** only in integration tests
6. **Clean up test data** in afterEach hooks

## Additional Resources

- [Effect Documentation](https://effect.website/docs)
- [Notion API Reference](https://developers.notion.com/reference)
- [Effect Schema Guide](https://effect.website/docs/schema/introduction)
- [Project Architecture](./Architecture.md)
- [Schema Adapter Pattern](./SchemaAdapter.md)
