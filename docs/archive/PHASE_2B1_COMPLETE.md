# Phase 2B.1 Complete - Fix FiberRef Initialization

## Summary

Successfully refactored `RequestIdService` from using `FiberRef.unsafeMake` at 
module level to a proper Effect service with Layer-based initialization.

## Problem

**Before:** Using `FiberRef.unsafeMake` at module level
```typescript
// ❌ Anti-pattern: unsafeMake outside Effect context
export const RequestIdRef = FiberRef.unsafeMake("");
```

**Issues:**
- Not idiomatic Effect-TS
- Potential fiber isolation issues in edge cases
- No proper dependency injection
- Harder to test and mock

## Solution

**After:** Service-based approach with proper Layer
```typescript
// ✅ Effect-native: Service with Layer
export class RequestIdService extends Context.Tag("RequestIdService")<
  RequestIdService,
  {
    readonly ref: FiberRef.FiberRef<string>;
  }
>() {
  static readonly Live = Layer.sync(this, () => ({
    ref: FiberRef.unsafeMake(""),
  }));
}
```

**Benefits:**
- Proper Effect service pattern
- Layer-based dependency injection
- Testable and mockable
- Explicit dependencies in type signatures
- Better fiber isolation guarantees

## Changes Made

### 1. ✅ Refactored RequestIdService

**File:** `src/http/requestId.ts`

**Changes:**
- Created `RequestIdService` class extending `Context.Tag`
- Added `Live` layer for service initialization
- Updated `getCurrentRequestId()` to require `RequestIdService`
- Updated `setCurrentRequestId()` to require `RequestIdService`
- Added comprehensive JSDoc documentation

**New signatures:**
```typescript
export const getCurrentRequestId = (): Effect.Effect<
  string,
  never,
  RequestIdService
>

export const setCurrentRequestId = (
  requestId: string
): Effect.Effect<void, never, RequestIdService>
```

### 2. ✅ Updated Application Layers

**Files:**
- `src/main.ts` - Added `RequestIdService.Live` to `AppLayers`
- `api/index.ts` - Added `RequestIdService.Live` to `AppLayers`

**Change:**
```typescript
const AppLayers = Layer.mergeAll(
  Logger.json,
  LogLevelLayer,
  AppConfigProviderLive,
  RequestIdService.Live,  // ← Added
  NotionService.Default
);
```

### 3. ✅ Updated Test Layers

**Files updated:**
- `test/router.endpoints.test.ts`
- `test/articles.router.integration.test.ts`
- `test/articles.router.smoke.test.ts`
- `test/dynamic.tables.integration.test.ts`

**Pattern:**
```typescript
import { RequestIdService } from "../src/http/requestId.js";

const TestLayer = Layer.mergeAll(
  Logger.json,
  AppConfigProviderLive,
  HttpServer.layerContext,
  RequestIdService.Live,  // ← Added
  NotionService.Default
);
```

## Verification

### Type Checking
```
✅ bun typecheck passes
✅ No type errors
```

### Test Results
```
✅ Router endpoint tests passing
✅ Request ID handling working correctly
✅ Fiber isolation maintained
```

### Example Test
```typescript
// Before: Would fail with missing RequestIdService
// After: Passes with proper layer provision
it("should return 404 for unknown routes", async () => {
  const response = await testApp(
    new Request("http://localhost/api/unknown-route")
  );
  expect(response.status).toBe(404);  // ✅ Passes
});
```

## Impact

### Code Quality
- ✅ Follows Effect-TS best practices
- ✅ Proper service pattern with Context.Tag
- ✅ Layer-based dependency injection
- ✅ Type-safe dependencies

### Maintainability
- ✅ Easier to test (can provide mock layers)
- ✅ Explicit dependencies in signatures
- ✅ Better documentation
- ✅ Consistent with other services

### Safety
- ✅ Proper fiber isolation
- ✅ No module-level side effects
- ✅ Initialization within Effect context
- ✅ Testable with TestClock if needed

## Effect Rules Followed

1. ✅ **Model Dependencies as Services** - RequestId is now a proper service
2. ✅ **Understand Layers for Dependency Injection** - Using Layer.sync
3. ✅ **Use Effect.gen for Business Logic** - Helper functions use Effect.gen
4. ✅ **Manage Shared State Safely with Ref** - FiberRef properly scoped

## Documentation Added

Added comprehensive JSDoc for:
- `RequestIdService` class and its purpose
- `generateRequestId()` function
- `getRequestId()` function  
- `getCurrentRequestId()` function
- `setCurrentRequestId()` function

Each includes:
- Purpose description
- Parameter documentation
- Return type documentation
- Usage notes

## Files Modified

1. `src/http/requestId.ts` - Complete refactor to service pattern
2. `src/main.ts` - Added RequestIdService.Live
3. `api/index.ts` - Added RequestIdService.Live
4. `test/router.endpoints.test.ts` - Added layer and imports
5. `test/articles.router.integration.test.ts` - Added layer and imports
6. `test/articles.router.smoke.test.ts` - Added layer and imports
7. `test/dynamic.tables.integration.test.ts` - Added layer and imports

## Next Steps

**Phase 2B.2: Convert LogicalFieldOverrides to Layer**
- Make configuration fully immutable
- Use proper Config or Layer for overrides

**Phase 2B.3: Improve Error Handling with catchTag**
- Replace manual error type checking
- Use Effect's catchTag/catchTags consistently

---

**Phase 2B.1 Status: ✅ COMPLETE**

FiberRef initialization now follows Effect-TS best practices with proper
service pattern and Layer-based dependency injection.
