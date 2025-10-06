# Phase 3 Plan - Observability & Advanced Patterns

## Overview

Phase 3 focuses on enhancing observability and leveraging advanced Effect
patterns for better monitoring, debugging, and data handling.

---

## Phase 3.1: Add Tracing Spans ⏸️

### Goal
Add distributed tracing with `Effect.withSpan` to key operations for better
observability in production.

### Implementation Pattern

```typescript
// Before
someOperation: (args) =>
  Effect.gen(function* () {
    // ... operation logic
    return result;
  }),

// After
someOperation: (args) =>
  Effect.gen(function* () {
    // ... operation logic
    return result;
  }).pipe(
    Effect.withSpan("ServiceName.operationName", {
      attributes: {
        // Key operation parameters
        param1: args.param1,
        param2: args.param2,
      },
    })
  ),
```

### Key Operations to Trace

#### ArticlesRepository (High Priority)
- ✅ `list` - Database queries with filters
  ```typescript
  Effect.withSpan("ArticlesRepository.list", {
    attributes: {
      source: params.source,
      databaseId: cfg.databaseId,
      pageSize: params.pageSize,
      hasFilter: !!params.filter,
    },
  })
  ```

- ✅ `get` - Single page retrieval
  ```typescript
  Effect.withSpan("ArticlesRepository.get", {
    attributes: {
      source: args.source,
      pageId: args.pageId,
    },
  })
  ```

- ✅ `create` - Page creation
  ```typescript
  Effect.withSpan("ArticlesRepository.create", {
    attributes: {
      source: args.source,
    },
  })
  ```

- ✅ `update` - Page updates
  ```typescript
  Effect.withSpan("ArticlesRepository.update", {
    attributes: {
      source: args.source,
      pageId: args.pageId,
    },
  })
  ```

- ✅ `delete` - Page deletion
  ```typescript
  Effect.withSpan("ArticlesRepository.delete", {
    attributes: {
      source: args.source,
      pageId: args.pageId,
    },
  })
  ```

#### NotionService (Medium Priority)
- `getDatabaseSchema` - Schema retrieval (cached)
- `listArticles` - Article listing
- `getArticleContent` - Content retrieval
- `updateArticleContent` - Content updates

#### NotionClient (Lower Priority)
- `queryDatabase` - Raw Notion API calls
- `retrievePage` - Page retrieval
- `createPage` - Page creation
- `updatePage` - Page updates

### Benefits
- **Performance monitoring** - Track operation duration
- **Distributed tracing** - Follow requests across services
- **Error correlation** - Link errors to specific operations
- **Production debugging** - Understand system behavior

### Integration
Works with OpenTelemetry exporters:
- Jaeger
- Zipkin
- Datadog
- New Relic
- Honeycomb

---

## Phase 3.2: Schema Transformations 📋

### Goal
Use `Schema.transform` to normalize data during validation, reducing
boilerplate and ensuring consistency.

### Common Transformations

#### 1. Trim Strings
```typescript
const TrimmedString = Schema.String.pipe(
  Schema.transform(
    Schema.String,
    {
      decode: (s) => s.trim(),
      encode: (s) => s,
    }
  )
);
```

#### 2. Optional Non-Empty Strings
```typescript
const OptionalNonEmpty = Schema.String.pipe(
  Schema.transform(
    Schema.OptionFromSelf(Schema.String),
    {
      decode: (s) => s.length === 0 ? Option.none() : Option.some(s),
      encode: Option.getOrElse(() => ""),
    }
  )
);
```

#### 3. Date Normalization
```typescript
const NormalizedDate = Schema.String.pipe(
  Schema.transform(
    Schema.Date,
    {
      decode: (s) => new Date(s),
      encode: (d) => d.toISOString(),
    }
  )
);
```

#### 4. URL Validation & Normalization
```typescript
const NormalizedUrl = Schema.String.pipe(
  Schema.filter((s) => {
    try {
      new URL(s);
      return true;
    } catch {
      return false;
    }
  }),
  Schema.transform(
    Schema.String,
    {
      decode: (s) => new URL(s).toString(),
      encode: (s) => s,
    }
  )
);
```

### Application Areas

#### Domain Models
```typescript
// Before
export const ArticleSchema = Schema.Struct({
  name: Schema.String,
  slug: Schema.String,
  url: Schema.optional(Schema.String),
});

// After
export const ArticleSchema = Schema.Struct({
  name: TrimmedString,
  slug: Schema.String.pipe(
    Schema.transform(
      Schema.String,
      {
        decode: (s) => s.toLowerCase().replace(/\s+/g, '-'),
        encode: (s) => s,
      }
    )
  ),
  url: Schema.optional(NormalizedUrl),
});
```

#### API Request Validation
```typescript
// Automatically normalize incoming data
const CreateArticleRequest = Schema.Struct({
  title: TrimmedString,
  description: OptionalNonEmpty,
  publishedAt: NormalizedDate,
  tags: Schema.Array(TrimmedString),
});
```

### Benefits
- **Data consistency** - Automatic normalization
- **Less boilerplate** - Transform during validation
- **Type safety** - Compile-time guarantees
- **Single source of truth** - Schema defines both shape and transforms

---

## Phase 3.3: Additional Improvements 🔧

### 3.3.1: More Specific Error Handling

Use `catchTags` for known error types:

```typescript
// Before
Effect.catchAll((e) =>
  Effect.fail(
    typeof (e as { _tag?: unknown })._tag === "string"
      ? (e as NotionError)
      : new InternalServerError({ cause: e })
  )
)

// After
Effect.catchTags({
  InvalidApiKeyError: (e) => 
    Effect.logError("Invalid API key").pipe(
      Effect.flatMap(() => Effect.fail(e))
    ),
  NotFoundError: (e) => 
    Effect.logWarning(`Resource not found: ${e.cause}`).pipe(
      Effect.flatMap(() => Effect.fail(e))
    ),
  RequestTimeoutError: (e) =>
    Effect.logWarning(`Request timeout after ${e.timeoutMs}ms`).pipe(
      Effect.flatMap(() => Effect.fail(e))
    ),
})
```

### 3.3.2: Config as Layers

Convert remaining configuration to Layer-based:

```typescript
// Current: Environment-based config
export const AppConfig = Config.all({
  port: Config.number("PORT").pipe(Config.withDefault(3000)),
  // ...
});

// Enhanced: Layer-based with overrides
export class PortConfig extends Context.Tag("PortConfig")<
  PortConfig,
  { readonly port: number }
>() {
  static readonly Live = Layer.effect(
    this,
    AppConfig.pipe(Effect.map((cfg) => ({ port: cfg.port })))
  );
  
  static make(port: number) {
    return Layer.succeed(this, { port });
  }
}

// Usage in tests
const TestPort = PortConfig.make(0); // Random port
```

### 3.3.3: Resource Pools

Add connection pooling for better performance:

```typescript
export const HttpClientPool = Layer.scoped(
  HttpClient.HttpClient,
  Effect.gen(function* () {
    const pool = yield* Effect.acquireRelease(
      Effect.sync(() => createPool({
        maxConnections: 50,
        idleTimeout: 30000,
      })),
      (pool) => Effect.sync(() => pool.close())
    );
    return pool.client;
  })
);
```

### 3.3.4: Caching Layer

Add a generic caching layer:

```typescript
export class CacheService extends Context.Tag("CacheService")<
  CacheService,
  {
    readonly get: <A>(key: string) => Effect.Effect<Option.Option<A>>;
    readonly set: <A>(key: string, value: A, ttl?: number) => Effect.Effect<void>;
  }
>() {
  static readonly Live = Layer.effect(
    this,
    Effect.gen(function* () {
      const cache = new Map<string, { value: unknown; expiresAt: number }>();
      
      return {
        get: <A>(key: string) =>
          Effect.sync(() => {
            const entry = cache.get(key);
            if (!entry || Date.now() > entry.expiresAt) {
              return Option.none();
            }
            return Option.some(entry.value as A);
          }),
        set: <A>(key: string, value: A, ttl = 60000) =>
          Effect.sync(() => {
            cache.set(key, {
              value,
              expiresAt: Date.now() + ttl,
            });
          }),
      };
    })
  );
}
```

---

## Implementation Priority

### High Priority (Do First)
1. ✅ **Tracing spans** - ArticlesRepository operations
2. ✅ **Schema transformations** - Domain models

### Medium Priority
3. **Tracing spans** - NotionService operations
4. **More catchTags** - Specific error handling
5. **Caching layer** - Generic cache service

### Low Priority (Nice to Have)
6. **Config layers** - Layer-based configuration
7. **Resource pools** - Connection pooling
8. **Additional spans** - NotionClient operations

---

## Effect Rules to Follow

### Phase 3.1 (Tracing)
- ✅ **Trace Operations Across Services with Spans**
- ✅ **Leverage Effect's Built-in Structured Logging**

### Phase 3.2 (Schemas)
- ✅ **Transform Data During Validation with Schema**
- ✅ **Define Contracts Upfront with Schema**

### Phase 3.3 (Advanced)
- ✅ **Handle Errors with catchTag, catchTags, and catchAll**
- ✅ **Manage Resource Lifecycles with Scope**
- ✅ **Create a Service Layer from a Managed Resource**

---

## Next Steps

1. **Review this plan** - Ensure priorities align with needs
2. **Implement Phase 3.1** - Add tracing spans incrementally
3. **Implement Phase 3.2** - Add schema transformations
4. **Measure impact** - Monitor performance and observability improvements
5. **Iterate** - Add more spans and transformations as needed

---

**Status:** 📋 **PLANNED**

Phase 3 enhancements are optional but provide significant value for
production observability and code quality. Implement based on priority
and available time.
