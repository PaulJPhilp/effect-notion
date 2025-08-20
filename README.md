# effect-notion

A simple and powerful Notion API proxy server built with Effect, Bun, and TypeScript. This server provides a clean and type-safe API for interacting with the Notion API, handling complex operations like pagination and multi-step updates behind the scenes.

## Features

- **Type-Safe**: Built with Effect and `@effect/schema` for end-to-end type safety.
- **High-Level API**: Abstracts away the complexities of the Notion API.
- **Ready for Deployment**: Configured for easy deployment to Vercel.
- **Testable**: Includes both unit and integration test suites.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (v1.2.21 or later)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/PaulJPhilp/effect-notion.git
   cd effect-notion
   ```

2. Install the dependencies:

   ```bash
   bun install
   ```

## Usage

### Running the Development Server

To start the server in development mode with hot-reloading, run:

```bash
bun dev
```

The server will be available at `http://localhost:3000`.

### Running in Production

To build and run the server in production mode, use:

```bash
bun start
```

## Testing

### Unit Tests

To run the unit tests, use:

```bash
bun test
```

### Integration Tests

The integration tests interact with the live Notion API and require a `.env` file with your Notion credentials. The tests are designed to be safe and idempotent, cleaning up after themselves.

1. Create a `.env` file in the project root:

   ```
   NOTION_API_KEY="secret_..."
   NOTION_DATABASE_ID="..."
   NOTION_PAGE_ID="..."
   ```

2. Run the integration tests:

   ```bash
   bun test test/NotionService.integration.test.ts
   ```

## API Endpoints

All endpoints are `POST` requests and expect a JSON body.

### `/api/list-articles`

Lists the articles (pages) in a Notion database.

**Request Body:**

```json
{
  "apiKey": "YOUR_NOTION_API_KEY",
  "databaseId": "YOUR_NOTION_DATABASE_ID"
}
```

**Example `curl`:**

```bash
curl -X POST http://localhost:3000/api/list-articles \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "YOUR_NOTION_API_KEY", "databaseId": "YOUR_NOTION_DATABASE_ID"}'
```

### `/api/get-article-content`

Retrieves the content of a Notion page.

**Request Body:**

```json
{
  "apiKey": "YOUR_NOTION_API_KEY",
  "pageId": "YOUR_NOTION_PAGE_ID"
}
```

**Example `curl`:**

```bash
curl -X POST http://localhost:3000/api/get-article-content \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "YOUR_NOTION_API_KEY", "pageId": "YOUR_NOTION_PAGE_ID"}'
```

### `/api/update-article-content`

Updates the content of a Notion page.

**Request Body:**

```json
{
  "apiKey": "YOUR_NOTION_API_KEY",
  "pageId": "YOUR_NOTION_PAGE_ID",
  "content": "The new content of the page."
}
```

**Example `curl`:**

```bash
curl -X POST http://localhost:3000/api/update-article-content \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "YOUR_NOTION_API_KEY", "pageId": "YOUR_NOTION_PAGE_ID", "content": "The new content of the page."}'
```

## Deployment

This project is configured for deployment to [Vercel](https://vercel.com/). Simply connect your GitHub repository to Vercel, and it will be deployed automatically.

## Built With

- [Effect](https://www.effect.website/) - A powerful and type-safe functional programming library for TypeScript.
- [Bun](https://bun.sh/) - A fast all-in-one JavaScript runtime.
- [Vitest](https://vitest.dev/) - A blazing fast unit-test framework powered by Vite.
- [TypeScript](https://www.typescriptlang.org/) - A typed superset of JavaScript.