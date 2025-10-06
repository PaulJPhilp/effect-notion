# Multi-Source Configuration Guide

This guide explains how to configure multiple Notion database sources using JSON configuration files.

## Overview

The `sources.config.json` file allows you to define multiple Notion databases (sources) that your application can query. Each source has:

- **Alias**: A unique identifier (e.g., `blog`, `handbook`)
- **Kind**: Entity type (`articles`, `changelog`, or `projects`)
- **Database ID**: Notion database ID or environment variable reference
- **Adapter**: Schema mapping adapter to use
- **Capabilities**: Operations allowed (update, delete)
- **Description**: Human-readable description (optional)

## Configuration File

### Location

By default, the configuration is loaded from `./sources.config.json`. You can override this with the `NOTION_SOURCES_CONFIG` environment variable:

```bash
NOTION_SOURCES_CONFIG=./sources.config.production.json bun start
```

### Basic Structure

```json
{
  "$schema": "./sources.config.schema.json",
  "version": "1.0",
  "sources": [
    {
      "alias": "blog",
      "kind": "articles",
      "databaseId": "${NOTION_DB_ARTICLES_BLOG}",
      "adapter": "blog",
      "capabilities": {
        "update": true,
        "delete": true
      },
      "description": "Public-facing blog posts"
    }
  ],
  "defaults": {
    "articles": {
      "adapter": "blog",
      "capabilities": {
        "update": true,
        "delete": true
      }
    }
  }
}
```

## Field Reference

### Source Configuration

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `alias` | Yes | string | Unique identifier for this source (lowercase, alphanumeric with hyphens) |
| `kind` | Yes | enum | Entity kind: `articles`, `changelog`, or `projects` |
| `databaseId` | Yes | string | Notion database ID or env var like `${NOTION_DB_ARTICLES_BLOG}` |
| `adapter` | No | string | Adapter name (defaults to kind default) |
| `capabilities` | No | object | Operations allowed on this source |
| `capabilities.update` | No | boolean | Allow updates (default: true) |
| `capabilities.delete` | No | boolean | Allow deletes/archives (default: true) |
| `description` | No | string | Human-readable description |

### Defaults

Define default settings per kind:

```json
"defaults": {
  "articles": {
    "adapter": "blog",
    "capabilities": {
      "update": true,
      "delete": true
    }
  }
}
```

## Environment Variables

Database IDs are typically provided via environment variables for security and flexibility:

**`.env` file:**
```bash
NOTION_DB_ARTICLES_BLOG=21ebc8039f7380a382adf66bc4133505
NOTION_DB_ARTICLES_HANDBOOK=35fcd9149g8491b493beg77cd5244616
```

**`sources.config.json`:**
```json
{
  "sources": [
    {
      "alias": "blog",
      "databaseId": "${NOTION_DB_ARTICLES_BLOG}"
    },
    {
      "alias": "handbook",
      "databaseId": "${NOTION_DB_ARTICLES_HANDBOOK}"
    }
  ]
}
```

### Environment Variable Substitution

- Format: `${VARIABLE_NAME}`
- Substitution happens at startup
- Missing variables result in empty strings (source is skipped with warning)
- Supports any environment variable name

## Multiple Sources Example

```json
{
  "version": "1.0",
  "sources": [
    {
      "alias": "blog",
      "kind": "articles",
      "databaseId": "${NOTION_DB_ARTICLES_BLOG}",
      "adapter": "blog",
      "capabilities": {
        "update": true,
        "delete": true
      },
      "description": "Public-facing blog posts"
    },
    {
      "alias": "handbook",
      "kind": "articles",
      "databaseId": "${NOTION_DB_ARTICLES_HANDBOOK}",
      "adapter": "blog",
      "capabilities": {
        "update": false,
        "delete": false
      },
      "description": "Internal handbook (read-only)"
    },
    {
      "alias": "product",
      "kind": "changelog",
      "databaseId": "${NOTION_DB_CHANGELOG_PRODUCT}",
      "adapter": "default",
      "capabilities": {
        "update": true,
        "delete": false
      },
      "description": "Product changelog"
    }
  ]
}
```

## Environment-Specific Configs

### Development

Use the default `sources.config.json` with full read/write access:

```json
{
  "sources": [
    {
      "alias": "blog",
      "capabilities": {
        "update": true,
        "delete": true
      }
    }
  ]
}
```

### Production

Use `sources.config.production.json` with read-only access:

```json
{
  "sources": [
    {
      "alias": "blog",
      "capabilities": {
        "update": false,
        "delete": false
      }
    }
  ]
}
```

**Deploy command:**
```bash
NOTION_SOURCES_CONFIG=./sources.config.production.json bun start
```

## Using Sources in API Calls

Once configured, reference sources by their alias:

```bash
# List blog articles
curl -X POST http://localhost:3000/api/articles/list \\
  -H "Content-Type: application/json" \\
  -d '{"source": "blog", "pageSize": 10}'

# List handbook articles
curl -X POST http://localhost:3000/api/articles/list \\
  -H "Content-Type: application/json" \\
  -d '{"source": "handbook", "pageSize": 10}'
```

## Adapters

### Available Adapters

| Kind | Adapter Name | Description |
|------|--------------|-------------|
| articles | `blog` | Default article adapter |
| changelog | `default` | (Not yet implemented) |
| projects | `default` | (Not yet implemented) |

### Adding Custom Adapters

1. Create adapter file in `src/domain/adapters/{kind}/{name}.adapter.ts`
2. Register in `src/domain/adapters/registry.ts`:

```typescript
import { myAdapter } from "./{kind}/my.adapter.js";

export const AdapterRegistry = {
  articles: {
    blog: blogArticleAdapter,
    my: myAdapter, // Add here
    default: blogArticleAdapter,
  },
};
```

3. Use in config:

```json
{
  "alias": "custom-source",
  "adapter": "my"
}
```

## Validation and Error Handling

### Startup Validation

On startup, the configuration is:
1. **Loaded** from JSON file
2. **Schema validated** against Effect Schema
3. **Env vars substituted** in database IDs
4. **Duplicates checked** for alias uniqueness
5. **Adapters verified** to exist in registry

### Error Messages

**Missing env var:**
```
[Config] Environment variable NOTION_DB_ARTICLES_BLOG not set, using empty string
[Sources] Skipping source 'blog': database ID not configured
```

**Invalid JSON:**
```
[Sources] Failed to load config: JSON Parse error: Expected '}'
[Sources] Falling back to empty source list
```

**Duplicate alias:**
```
[Sources] Failed to load config: Duplicate source alias found: blog
```

**Missing adapter:**
```
[Sources] No adapter found for articles/custom (source: my-source)
[Sources] Skipping source 'my-source'. Register adapter in registry.ts
```

### Successful Load

```
[Sources] Loaded 2 source(s):
  - articles/blog (update=true, delete=true) - Public blog posts
  - articles/handbook (update=false, delete=false) - Internal handbook
```

## Troubleshooting

### Source Not Loading

**Symptom:** Source doesn't appear in startup logs

**Causes:**
1. Environment variable not set → Check `.env` file
2. Database ID empty after substitution → Verify env var name matches
3. Invalid adapter name → Check `src/domain/adapters/registry.ts`
4. Duplicate alias → Use unique aliases

**Solution:**
```bash
# Check what sources loaded
bun run dev | grep "Sources"

# Verify env vars
echo $NOTION_DB_ARTICLES_BLOG
```

### Configuration Not Found

**Symptom:** `Failed to load config from ./sources.config.json`

**Solution:**
1. Ensure file exists: `ls sources.config.json`
2. Check JSON syntax: `cat sources.config.json | jq .`
3. Verify schema: Compare with `sources.config.example.json`

### Wrong Configuration Loaded

**Symptom:** Production shows development sources

**Solution:**
Set `NOTION_SOURCES_CONFIG` environment variable:
```bash
# Vercel
vercel env add NOTION_SOURCES_CONFIG production

# Local
export NOTION_SOURCES_CONFIG=./sources.config.production.json
```

## Best Practices

1. **Version control default config** - Commit `sources.config.json`
2. **Use env-specific configs** - Keep production config separate
3. **Descriptive aliases** - Use clear, meaningful names
4. **Add descriptions** - Help future developers understand sources
5. **Read-only in production** - Set `update: false, delete: false`
6. **Validate before deploy** - Test config locally first
7. **Document env vars** - Update `.env.example` with new variables

## Example Configurations

### Single Source (Simple)

```json
{
  "version": "1.0",
  "sources": [
    {
      "alias": "blog",
      "kind": "articles",
      "databaseId": "${NOTION_DB_ARTICLES_BLOG}"
    }
  ]
}
```

### Multi-Source (Articles Only)

```json
{
  "version": "1.0",
  "sources": [
    {
      "alias": "blog",
      "kind": "articles",
      "databaseId": "${NOTION_DB_ARTICLES_BLOG}"
    },
    {
      "alias": "docs",
      "kind": "articles",
      "databaseId": "${NOTION_DB_ARTICLES_DOCS}"
    },
    {
      "alias": "handbook",
      "kind": "articles",
      "databaseId": "${NOTION_DB_ARTICLES_HANDBOOK}",
      "capabilities": {
        "update": false,
        "delete": false
      }
    }
  ]
}
```

### Multi-Kind (Articles + Changelog + Projects)

```json
{
  "version": "1.0",
  "sources": [
    {
      "alias": "blog",
      "kind": "articles",
      "databaseId": "${NOTION_DB_ARTICLES_BLOG}"
    },
    {
      "alias": "product",
      "kind": "changelog",
      "databaseId": "${NOTION_DB_CHANGELOG_PRODUCT}"
    },
    {
      "alias": "portfolio",
      "kind": "projects",
      "databaseId": "${NOTION_DB_PROJECTS_PORTFOLIO}"
    }
  ]
}
```

## Schema Validation

The configuration file can reference the JSON Schema for IDE autocomplete and validation:

```json
{
  "$schema": "./sources.config.schema.json",
  "version": "1.0",
  "sources": [...]
}
```

Most modern editors (VS Code, WebStorm, etc.) will provide:
- Autocomplete for field names
- Validation of field types
- Inline error messages for invalid configurations

## Migration from Hardcoded Sources

See [MIGRATION_CONFIG.md](./MIGRATION_CONFIG.md) for step-by-step migration instructions.
