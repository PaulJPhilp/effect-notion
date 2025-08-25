# effect-notion

`effect-notion` is a lightweight, production-ready server that acts as a secure proxy for the Notion API. Built with the powerful [Effect](https://effect.website/) library, it provides a robust, type-safe, and efficient way to fetch data from Notion databases and pages.

It comes with a suite of features designed for serious application development, including logical field overrides, dynamic filtering, and schema-driven type generation.

## Who is this for?

This server is ideal for developers building front-end applications (e.g., blogs, documentation sites, personal portfolios) that use Notion as a CMS. It acts as a secure and robust backend layer, abstracting away the complexities of the Notion API and preventing the exposure of API keys on the client-side.

## Architecture

The server acts as a secure intermediary between your application and the Notion API.

`[Your Frontend App] <--> [effect-notion server] <--> [Notion API]`

Your frontend makes requests to this server, and this server, which securely stores your `NOTION_API_KEY`, makes the authenticated requests to Notion.

## Features

- **Secure Notion API Proxy**: Safely access the Notion API without exposing your credentials on the client-side.
- **Rich Filtering Capabilities**: Dynamically filter Notion database entries using a flexible JSON-based query language.
- **Logical Field Overrides**: Decouple your application from your Notion schema by mapping Notion's field names to logical names in your code.
- **Codegen for Type Safety**: Generate TypeScript types from your live Notion database to ensure end-to-end type safety.
- **Built with Effect**: Leverages the Effect library for a highly performant, concurrent, and error-resilient server.
- **Ready to Deploy**: Includes configurations for easy deployment to services like Vercel.

## Runtime and adapters

- `src/router.ts`: Pure Effect-based `HttpApp` with all routes. This is the
  single source of truth (no adapter bypasses).
- `api/index.ts`: Vercel Node v3 adapter. Materializes the Effect app into a
  Fetch-style handler and bridges to Node's `IncomingMessage/ServerResponse`.
- `src/main.ts`: Local Bun server entry for development using Effect's Node
  HTTP server integration.

## Configuration & Security

This server is designed to be the **sole keeper** of your `NOTION_API_KEY`. The key must be configured on the server as an environment variable and should never be exposed to or sent from your client-side application.

Create a `.env` file in the root of the project by copying the `.env.example` file.

```bash
cp .env.example .env
```

### Environment Variables

- `NOTION_API_KEY`: **Required. Your Notion API integration key.** This is a secret and should be set securely in your deployment environment.
- `NOTION_DATABASE_ID`: **Optional.** A default database ID to use for queries if one is not provided in the API request.
- `NOTION_PAGE_ID`: **Optional.** A default page ID to use for queries if one is not provided in the API request.

## Quick Start

1.  **Install dependencies:**
    ```bash
    bun install
    ```
2.  **Run the development server:**
    ```bash
    bun run dev
    ```
3.  **The server will be available at `http://localhost:3000`.**

## API Endpoints

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

For maximum type safety and to catch schema-related errors at compile-time instead of runtime, you can generate TypeScript types directly from your live Notion database.

**How to use it:**

1.  **Ensure your `.env` file has `NOTION_API_KEY` and `NOTION_DATABASE_ID` set.**
2.  **Run the codegen script:**
    ```bash
    bun run codegen:notion
    ```
3.  **The script will create `src/NotionSchema.ts` with your database's schema.**

## Testing

The project includes a suite of integration tests that run against a live Notion database.

**To run the tests:**

1.  **Make sure your `.env` file is configured with your Notion credentials.**
2.  **Run the test command:**
    ```bash
    bun test
    ```

## Deployment

The server is configured for easy deployment on Vercel. Simply connect your repository to a new Vercel project and configure the environment variables as described in the "Configuration & Security" section.

## Contributing

Contributions are welcome! Please feel free to open an issue or submit a pull request.

Before submitting a pull request, please ensure the project builds and tests
pass:

```bash
bun run build    # type-check
bun test         # run tests
```
