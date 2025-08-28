# effect-notion

`effect-notion` is a lightweight, production-ready server that acts as a
secure proxy for the Notion API. Built with the powerful
[Effect](https://effect.website/) library, it provides a robust, type-safe,
and efficient way to fetch data from Notion databases and pages.

It includes features for real apps: logical field overrides, dynamic
filtering, schema-aware validation, consistent errors, and optional
type/code generation.

## Who is this for?

This server is ideal for developers building front-end applications (e.g., blogs, documentation sites, personal portfolios) that use Notion as a CMS. It acts as a secure and robust backend layer, abstracting away the complexities of the Notion API and preventing the exposure of API keys on the client-side.

## Architecture

The server acts as a secure intermediary between your application and the
Notion API.

`[Your Frontend App] <--> [effect-notion server] <--> [Notion API]`

Your frontend talks to this server; the server (holding your
`NOTION_API_KEY`) talks to Notion.

## Features

- **Secure Notion API Proxy**: Safely access the Notion API without exposing your credentials on the client-side.
- **Rich Filtering Capabilities**: Dynamically filter Notion database entries using a flexible JSON-based query language.
- **Logical Field Overrides**: Decouple your application from your Notion schema by mapping Notion's field names to logical names in your code.
- **Codegen for Type Safety**: Generate TypeScript types from your live Notion database to ensure end-to-end type safety.
- **Built with Effect**: Leverages the Effect library for a highly performant, concurrent, and error-resilient server.
- **Ready to Deploy**: Includes configurations for easy deployment to services like Vercel.
- **Consistent Error Model**: All errors return normalized JSON with a stable shape and a `requestId` for tracing.

## Runtime and adapters

- `src/router.ts`: Effect `HttpRouter` defining the API surface. It is the
  source of truth for business logic and error handling.
- `api/index.ts`: Vercel Node v3 adapter. It converts the router to a
  Fetch-style handler and applies logging + CORS. Note: this adapter currently
  implements a minimal fast-path for `GET /api/ping` and handles `OPTIONS`
  preflight before invoking the router.
- `src/main.ts`: Local Bun/Node server entry for development using the
  Effect Node HTTP server integration.

Logging & CORS:
- Both entry points enable structured logging via `HttpMiddleware.logger`.
- CORS is enabled; configure via `CORS_ORIGIN`.

## Configuration & Security

This server is the **sole keeper** of your `NOTION_API_KEY`. Never expose or
send this key from the client.

Create a `.env` file at the project root by copying `.env.example`:

```bash
cp .env.example .env
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
- `LOG_LEVEL`: Effect logger level. Default: `Info`.
- `NOTION_API_KEY`: Your Notion integration key.
- `NOTION_DATABASE_ID`: Optional default database id.
- `NOTION_PAGE_ID`: Optional default page id.

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

## API Endpoints

Note on HTTP methods:

- Use GET for simple, idempotent retrieval by ID (e.g., `pageId` in query).
- Use POST when a structured JSON body is required (e.g., filters/sorts for
  listing; content payload for update).

### Ping (liveness)

- **Endpoint**: `GET /api/ping`
- **Description**: Simple liveness probe. Returns `ok`.


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
- **Description**: Reports server health. If `NOTION_DATABASE_ID` is set, the
  server performs a real Notion call to validate connectivity.

**Example:**

```bash
curl "http://localhost:3000/api/health"
```

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
- `databaseId`: `NOTION_DATABASE_ID`
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
