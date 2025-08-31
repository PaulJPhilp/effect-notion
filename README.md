# effect-notion

`effect-notion` is a lightweight, production-ready server that acts as a
secure proxy for the Notion API. Built with the powerful
[Effect](https://effect.website/) library, it provides a robust, type-safe,
and efficient way to fetch data from Notion databases and pages.

It includes features for real apps: logical field overrides, dynamic
filtering, schema-aware validation, consistent errors, and optional
type/code generation.

## Who is this for?

This server is ideal for developers building front-end applications (e.g., blogs, documentation sites, personal portfolios) that use Notion as a CMS. It acts as a secure and robust backend layer, abstracting away the complexities of the Notion API and preventing the exposure of API keys on the client-side.  Think of it as a "smart bridge" that makes Notion work like a traditional database while keeping all the benefits of Notion's interface and collaboration features.

## Key Benefits
Security: API keys never leave your server
Type Safety: Full TypeScript support with generated types
Flexibility: Decouples your app from Notion's exact schema
Performance: Built for production with Effect's concurrent processing
Deployment Ready: Works with Vercel and other platforms

## Architecture

The server acts as a secure intermediary between your application and the
Notion API.

`[Your Frontend App] <--> [effect-notion server] <--> [Notion API]`

Your frontend talks to this server; the server (holding your
`NOTION_API_KEY`) talks to Notion.

### Schema-driven adapters

See `docs/SchemaAdapter.md` for the schema-driven adapter pattern used to
map Notion property bags to domain entities using Effect Schema, including
how to add new field mappings.

## Features

- **Secure Notion API Proxy**: Safely access the Notion API without exposing your credentials on the client-side.
- **Rich Filtering Capabilities**: Dynamically filter Notion database entries using a flexible JSON-based query language.
- **Logical Field Overrides**: Decouple your application from your Notion schema by mapping Notion's field names to logical names in your code.
- **Codegen for Type Safety**: Generate TypeScript types and Effect Schema from your live Notion database to ensure end-to-end type safety.
- **Built with Effect**: Leverages the Effect library for a highly performant, concurrent, and error-resilient server.
- **Ready to Deploy**: Includes configurations for easy deployment to services like Vercel.
- **Consistent Error Model**: All errors return normalized JSON with a stable shape and a `requestId` for tracing.
- **Performance Monitoring**: Built-in metrics collection and monitoring via `/api/metrics` endpoint.
- **Advanced Error Handling**: Circuit breakers and retry strategies for improved reliability and fault tolerance.

## Runtime and adapters

- `src/router.ts`: Effect `HttpRouter` defining the API surface. It is the
  source of truth for business logic and error handling.
- `api/index.ts`: Vercel Node v3 adapter. It converts the router to a
  Fetch-style handler and applies logging + CORS. Health and all routes
  are served via the router (no fast-path bypasses).
- `src/main.ts`: Local Bun/Node server entry for development using the
  Effect Node HTTP server integration.

Logging & CORS:
- Both entry points enable structured logging via `HttpMiddleware.logger`.
- CORS is enabled; configure via `CORS_ORIGIN`.

## Performance Monitoring & Resilience

The application includes built-in performance monitoring and advanced error handling:

- **Metrics Endpoint**: `/api/metrics` provides real-time metrics in Prometheus format
- **Circuit Breakers**: Automatic fault tolerance for Notion API calls
- **Retry Strategies**: Intelligent retry logic with exponential backoff
- **Request Tracing**: Every request includes a unique ID for correlation

See `docs/METRICS_AND_RESILIENCE.md` for detailed documentation and usage examples.

## Configuration & Security

This server is the **sole keeper** of your `NOTION_API_KEY`. Never expose or
send this key from the client.

Create a `.env` file at the project root with the following variables:

```bash
# Required
NOTION_API_KEY=your_notion_integration_key_here

# Optional
NODE_ENV=development
PORT=3000
CORS_ORIGIN=*
LOG_LEVEL=Info
NOTION_DB_ARTICLES_BLOG=your_blog_database_id_here
```

### Env file precedence

Loaded at startup in this order (later overrides earlier):

1) `.env`
2) `.env.local`
3) `.env.$NODE_ENV`
4) `.env.$NODE_ENV.local`

### Environment variables

- `NODE_ENV` (development | test | production). Default: development.
- `PORT`: Port for local server. Default: 3000.
- `CORS_ORIGIN`: CORS allowed origin(s). Default: `*`.
- `CORS_ALLOWED_METHODS`: Comma-separated list of allowed HTTP methods. Default: `POST,GET,OPTIONS`.
- `CORS_ALLOWED_HEADERS`: Comma-separated list of allowed headers. Default: `Content-Type,Authorization`.
- `LOG_LEVEL`: Effect logger level. Default: `Info`.
- `NOTION_API_KEY`: Your Notion integration key.
- `NOTION_DB_ARTICLES_BLOG`: Optional database id for the `articles`
  router when using the `blog` source. If set, the `articles` endpoints can
  read/write from this database using the blog adapter. See the "Articles"
  API section below.

## Quick Start

1. **Install dependencies**
   ```bash
   bun install
   ```
2. **Run the dev server (Bun)**
   ```bash
   bun run dev
   ```
3. Server runs at `http://localhost:3000` (or your `PORT`).

Useful scripts from `package.json`:

- `bun start` — run `src/main.ts`
- `bun run dev` — watch mode
- `bun test` — run tests (Vitest via Bun)
- `bun run build` — type-check via `tsc`
- `bun run codegen:notion` — run schema codegen (see below)

Diagnostics helper:

```bash
bun scripts/diagnose.ts /api/health
```

You can also POST JSON bodies to exercise routes end-to-end. The script
prints request/response details and structured logs.

Usage:

```bash
# GET (default method)
bun scripts/diagnose.ts "/api/health"

# POST with JSON body
bun scripts/diagnose.ts "/api/articles/list" POST '{"source":"blog","pageSize":5}'

# Arbitrary path + body
bun scripts/diagnose.ts "/api/your/route" POST '{"key":"value"}'
```

Notes:

- Content-Type is set to `application/json` automatically for POST bodies.
- Logs include pre-response info and Effect structured logs at Debug level.

## API Endpoints

Note on HTTP methods:

- Use GET for simple, idempotent retrieval by ID (e.g., `pageId` in query).
- Use POST when a structured JSON body is required (e.g., filters/sorts for
  listing; content payload for update).

### List Articles (paginated)

- **Endpoint**: `POST /api/list-articles`
- **Description**: Retrieves a paginated list of items from a Notion database,
  with optional filtering and sorting.

**Request Body:**

```json
{
  "databaseId": "YOUR_NOTION_DATABASE_ID",
  "titlePropertyName": "Name",
  "filter": {
    "property": "Status",
    "select": { "equals": "Published" }
  },
  "sorts": [
    { "property": "Date", "direction": "descending" }
  ],
  "pageSize": 20,            // optional (1-100)
  "startCursor": "..."       // optional
}
```

**Response:**

```json
{
  "results": [
    { "id": "...", "title": "..." }
  ],
  "hasMore": true,
  "nextCursor": "..." // null when no more
}
```

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/list-articles \
  -H "Content-Type: application/json" \
  -d '{
    "databaseId": "<YOUR_DATABASE_ID>",
    "titlePropertyName": "Name",
    "filter": {
      "property": "Status",
      "select": { "equals": "Published" }
    },
    "pageSize": 20
  }'
```

### Get Article Content

- **Endpoint**: `GET /api/get-article-content`
- **Description**: Retrieves the content of a single Notion page, formatted as Markdown.

**Query Parameters:**

- `pageId`: The ID of the Notion page to retrieve.

**Example Request:**

```bash
curl "http://localhost:3000/api/get-article-content?pageId=<YOUR_PAGE_ID>"
```

### Update Article Content

- **Endpoint**: `POST /api/update-article-content`
- **Description**: Replaces the content of a Notion page with new content provided as a Markdown string.

**Request Body:**

```json
{
  "pageId": "YOUR_NOTION_PAGE_ID",
  "content": "# New Title\n\nThis is the new content of the page."
}
```

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/update-article-content \
-H "Content-Type: application/json" \
-d '{
  "pageId": "<YOUR_PAGE_ID>",
  "content": "# My New Page Title\n\nAnd this is the updated content."
}'
```

### Get Database Schema

- **Endpoint**: `GET /api/get-database-schema`
- **Description**: Returns the normalized live schema for a Notion database.

**Example:**

```bash
curl "http://localhost:3000/api/get-database-schema?databaseId=<YOUR_DB_ID>"
```

### Get Article Metadata (properties)

- **Endpoint**: `GET /api/get-article-metadata`
- **Description**: Returns the raw Notion page `properties` for a page.

**Example:**

```bash
curl "http://localhost:3000/api/get-article-metadata?pageId=<YOUR_PAGE_ID>"
```

### Error Responses (normalized)

All error responses follow a consistent JSON structure and include a request ID:

```json
{
  "error": "Bad Request",
  "code": "BadRequest",
  "requestId": "abcd1234",
  "detail": "Optional human-friendly text",
  "errors": ["Optional list of validation errors"]
}
```

- Codes include: `BadRequest`, `InvalidApiKey`, `NotFound`,
  `InternalServerError`.
- The `x-request-id` header mirrors `requestId` for log correlation.

### Health (router-based)

- **Endpoint**: `GET /api/health`
- **Description**: Reports server health via the router.

**Example:**

```bash
curl "http://localhost:3000/api/health"
```

### Articles (router-based, source-aware)

These endpoints operate on logical "articles" and are parameterized by a
`source` (e.g., `blog`). Sources are configured in
`src/domain/registry/sources.ts` from environment variables.

- Current built-in source:
  - `blog` → requires `NOTION_DB_ARTICLES_BLOG` to be set.

All POST requests require `Content-Type: application/json`.

• List
- Endpoint: `POST /api/articles/list`
- Body:
```json
{ "source": "blog", "pageSize": 20 }
```

• Get by id
- Endpoint: `GET /api/articles/get`
- Query: `source=blog&pageId=<PAGE_ID>`

• Create
- Endpoint: `POST /api/articles/create`
- Body (partial fields are allowed):
```json
{ "source": "blog", "data": { "name": "New Article" } }
```

• Update
- Endpoint: `POST /api/articles/update`
- Body (partial fields are allowed):
```json
{
  "source": "blog",
  "pageId": "<PAGE_ID>",
  "patch": { "name": "Updated" }
}
```

• Delete (archive)
- Endpoint: `POST /api/articles/delete`
- Body:
```json
{ "source": "blog", "pageId": "<PAGE_ID>" }
```

Notes:
- Field shapes align with `src/domain/logical/Common.ts` (`BaseEntity`,
  `ListParams`).
- The Notion mapping is handled by the source adapter, e.g.,
  `src/domain/adapters/articles/blog.adapter.ts`.

## Advanced Features

### Dynamic Filtering

You can construct complex filters based on the Notion API's filter object structure.

**Example: Compound filter**

This request fetches entries where "Status" is "In Progress" AND "Priority" is "High".

```bash
# The JSON body for your POST /api/list-articles request:
{
  "databaseId": "<YOUR_DATABASE_ID>",
  "filter": {
    "and": [
      { "property": "Status", "select": { "equals": "In Progress" } },
      { "property": "Priority", "select": { "equals": "High" } }
    ]
  }
}
```

### Codegen

Optional codegen can emit a static module describing your current Notion
database schema to aid compile-time checks.

From `scripts/generate-notion-schema.ts`:

```bash
# Uses env vars if flags are omitted
bun scripts/generate-notion-schema.ts \
  --databaseId <id> \
  [--apiKey <key>] \
  [--out src/generated/notion-schema.ts] \
  [--emitEffectSchema]
```

Defaults:

- `apiKey`: `NOTION_API_KEY`
- `out`: `src/generated/notion-schema.ts`

Outputs:

- `src/generated/notion-schema.ts` (types and data)
- If `--emitEffectSchema` is provided, also emits
  `src/generated/notion-schema.effect.ts`.

## Testing

Tests include live Notion integration. Ensure env vars are set (`.env` or
system).

```bash
bun test
```

The project uses Vitest for testing with the following configuration:
- Test environment: Node.js
- Test files: `test/**/*.test.ts`
- Excludes compiled JavaScript and node_modules

## Deployment

Vercel configuration (`vercel.json`) targets Node v3 runtime for the
serverless function and routes all paths to `api/index.ts`.

```json
{
  "version": 2,
  "functions": {
    "api/index.ts": { "runtime": "@vercel/node@3.2.20" }
  },
  "routes": [
    { "src": "/api/(.*)", "dest": "api/index.ts" },
    { "src": "/(.*)", "dest": "api/index.ts" }
  ]
}
```

Steps:

1) Push to a Git repo and import into Vercel.
2) Set env vars from the "Environment variables" section.
3) Deploy.

## Contributing

Contributions are welcome! Please open an issue or PR.

Before submitting a PR, ensure build and tests pass:

```bash
bun run build  # type-check
bun test       # run tests
```

## Modular Services & Import Conventions

- Services live under `src/services/<ServiceName>/` with a consistent layout:
  - `api.ts` — public interface and Effect tag
  - `types.ts` — request/response types
  - `errors.ts` — typed errors (optional)
  - `helpers.ts` — pure helpers
  - `service.ts` — implementation and `.Default` layer
  - `__tests__/` — colocated tests

- Backward compatibility is preserved with re-exports:
  - `src/<ServiceName>.ts` re-exports from
    `src/services/<ServiceName>/service.ts`
  - `src/services/<ServiceName>.ts` (legacy) also re-exports to the new impl

- TypeScript NodeNext with verbatim syntax requires explicit extensions:
  - Use `.js` for runtime imports of values
  - Use `.ts` for type-only imports

Example:

```ts
// runtime
import { NotionService } from "./src/services/NotionService/service.js"

// type-only
import type { ListResult } from "./src/services/ArticlesRepository/types.ts"
```
