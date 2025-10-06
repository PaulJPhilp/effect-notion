# Notion Service Enhancement - Article Properties Update

## Overview

Enhanced the `NotionService` with two functions to communicate with the 
effect-notion proxy for managing article metadata and publishing workflows.

## Implementation Details

### 1. `getArticleMetadata(pageId: string)`

**Purpose:** Fetch the required publishing fields for an article.

**Location:** 
- Service: `/src/services/NotionService/service.ts` (lines 410-427)
- API Interface: `/src/services/NotionService/api.ts` (lines 52-54)

**Signature:**
```typescript
getArticleMetadata: (
  pageId: string
) => Effect.Effect<{ properties: unknown }, NotionError>
```

**Implementation:**
- Retrieves a Notion page using `notionClient.retrievePage()`
- Returns the page properties as an unknown object for flexible handling
- Includes comprehensive error logging and mapping
- Maps unknown errors to `InternalServerError` for consistent error handling

**Usage Example:**
```typescript
const metadata = yield* notionService.getArticleMetadata(pageId);
// metadata.properties contains all Notion page properties
```

### 2. `updateArticleProperties(pageId: string, properties: Record<string, unknown>)`

**Purpose:** Update an article's status, set its published date, and save 
any other metadata changes.

**Location:**
- Service: `/src/services/NotionService/service.ts` (lines 429-451)
- API Interface: `/src/services/NotionService/api.ts` (lines 56-59)

**Signature:**
```typescript
updateArticleProperties: (
  pageId: string,
  properties: Record<string, unknown>
) => Effect.Effect<{ properties: unknown }, NotionError>
```

**Implementation:**
- Updates Notion page properties using `notionClient.updatePage()`
- Accepts flexible property structure following Notion API format
- Returns updated page properties for verification
- Includes comprehensive error logging and mapping
- Maps unknown errors to `InternalServerError` for consistent error handling

**Usage Example:**
```typescript
// Update article status and published date
const properties = {
  "Status": {
    select: {
      name: "Published"
    }
  },
  "Published Date": {
    date: {
      start: new Date().toISOString()
    }
  }
};

const result = yield* notionService.updateArticleProperties(
  pageId, 
  properties
);
```

## Key Features

### Error Handling
Both functions follow Effect best practices:
- Use `Effect.tapError` for logging warnings with detailed context
- Map errors to typed `NotionError` union for proper error handling
- Fall back to `InternalServerError` for unexpected errors
- Include pageId and error tag in all log messages

### Type Safety
- API interface defines clear contracts in `api.ts`
- Service implementation in `service.ts` matches interface exactly
- Uses `unknown` for properties to allow flexible Notion property types
- Follows Effect-TS patterns for error channels

### Notion API Integration
- Leverages existing `NotionClient` service methods
- Uses `notionApiKey` from `AppConfig` context
- Respects Notion API property structure conventions
- Returns updated properties for verification workflows

## Testing

Created comprehensive integration tests in:
`/src/services/NotionService/__tests__/NotionService.updateProperties.test.ts`

**Test Coverage:**
1. **Retrieve article metadata** - Validates `getArticleMetadata` returns 
   properties object
2. **Update article properties** - Tests `updateArticleProperties` with 
   status updates
3. **Update published date** - Tests date property updates

**Test Results:**
- Tests properly validate function signatures and return types
- Error handling correctly surfaces Notion API errors
- Integration with Effect runtime and layers works as expected

## Architecture Alignment

### Effect-TS Patterns
✅ **Access Configuration from the Context** - Uses `AppConfig` for API key  
✅ **Model Dependencies as Services** - Depends on `NotionClient` service  
✅ **Handle Errors with catchAll** - Maps errors to typed union  
✅ **Leverage Effect's Built-in Structured Logging** - Uses `Effect.logWarning`  
✅ **Use Effect.gen for Business Logic** - Generator-based implementation  

### Service Structure
Follows the modular services structure documented in Architecture.md:
- `api.ts` - Public service interface
- `service.ts` - Concrete Effect.Service implementation
- `__tests__/` - Colocated integration tests

### Backward Compatibility
- Re-exports maintained in `/src/NotionService.ts`
- Existing service methods unchanged
- New methods added to existing service interface

## Integration Points

### Current Usage
The `getArticleMetadata` function is already used in the router:
- `/api/get-article-metadata` endpoint (line 161 in router.ts)

### Future Integration
The `updateArticleProperties` function is ready for:
- Publishing workflow endpoints
- Article status management
- Metadata synchronization
- Batch property updates

## Property Format Reference

Notion properties follow specific formats. Common examples:

```typescript
// Select property
{ "Status": { select: { name: "Published" } } }

// Multi-select property
{ "Tags": { multi_select: [{ name: "Tech" }, { name: "Tutorial" }] } }

// Date property
{ "Published Date": { date: { start: "2025-10-02T00:00:00.000Z" } } }

// Rich text property
{ "Description": { rich_text: [{ text: { content: "Article description" } }] } }

// Checkbox property
{ "Featured": { checkbox: true } }

// Number property
{ "Views": { number: 1000 } }
```

## Next Steps

Potential enhancements:
1. Add router endpoint for `/api/update-article-properties`
2. Create schema validation for common property updates
3. Add helper functions for common property transformations
4. Implement batch property update support
5. Add property validation against database schema

## Files Modified

1. `/src/services/NotionService/service.ts` - Added `updateArticleProperties`
2. `/src/services/NotionService/api.ts` - Added interface definition
3. `/src/services/NotionService/__tests__/NotionService.updateProperties.test.ts` 
   - New test file

## Type Check Status

✅ All TypeScript compilation passes (`bun run typecheck`)  
✅ No breaking changes to existing code  
✅ Full type safety maintained throughout  
