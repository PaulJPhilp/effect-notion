# Migration Guide: Hardcoded to Config-Based Sources

This guide walks you through migrating from the old hardcoded source registration to the new JSON configuration system.

## Overview

**Before:** Sources were hardcoded in `src/domain/registry/sources.ts`
**After:** Sources are defined in `sources.config.json` with environment variable substitution

## Benefits of Migration

- ✅ **No code changes** needed to add/remove sources
- ✅ **Environment-specific configs** (dev vs production)
- ✅ **Runtime validation** with clear error messages
- ✅ **Better separation** of configuration from code
- ✅ **Type-safe** with JSON Schema validation
- ✅ **Documented** with inline descriptions

## Before and After

### Before (Hardcoded)

**`src/domain/registry/sources.ts`:**
```typescript
const loadFromEnv = (): ReadonlyArray<SourceConfig> => {
  const out: SourceConfig[] = []
  const BLOG_DB = process.env.NOTION_DB_ARTICLES_BLOG
  if (BLOG_DB && BLOG_DB.length > 0) {
    out.push({
      alias: "blog",
      databaseId: BLOG_DB,
      kind: "articles",
      adapter: blogArticleAdapter,
      capabilities: { update: true, delete: true },
    })
  }
  return out
}
```

**Issues:**
- Adding a source requires code change
- No runtime validation
- Adapter hardcoded
- Capabilities hardcoded

### After (Config-Based)

**`sources.config.json`:**
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
    }
  ]
}
```

**Benefits:**
- Add sources by editing JSON
- Schema validation on startup
- Adapter lookup from registry
- Capabilities configurable per environment

## Migration Steps

### Step 1: Understand Current Configuration

Check what sources are currently configured:

```bash
# Start server and check logs
bun run dev | grep "Sources"

# Output should show:
# [Sources] Loaded 1 source(s):
#   - articles/blog (update=true, delete=true) - Public-facing blog posts
```

### Step 2: Verify Environment Variables

Ensure your `.env` file has the necessary database IDs:

```bash
cat .env | grep NOTION_DB
```

**Expected:**
```bash
NOTION_DB_ARTICLES_BLOG=21ebc8039f7380a382adf66bc4133505
```

### Step 3: Review Default Configuration

The default `sources.config.json` already includes the blog source:

```bash
cat sources.config.json
```

**You should see:**
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

### Step 4: Test the Configuration

Run tests to ensure everything works:

```bash
# Type-check
bun run build

# Run tests
bun test

# Start server
bun run dev
```

**Verify startup logs:**
```
[Sources] Loaded 1 source(s):
  - articles/blog (update=true, delete=true) - Public-facing blog posts
```

### Step 5: No Code Changes Required!

The migration is **complete**. The old hardcoded logic has been replaced with config loading, but your existing environment variables and database setup remain unchanged.

## Adding New Sources

Now that you're using config-based sources, adding a new source is simple:

### Example: Add Handbook Source

**1. Add environment variable to `.env`:**
```bash
NOTION_DB_ARTICLES_HANDBOOK=35fcd9149g8491b493beg77cd5244616
```

**2. Add source to `sources.config.json`:**
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
      "description": "Internal company handbook (read-only)"
    }
  ]
}
```

**3. Restart server:**
```bash
bun run dev
```

**4. Verify:**
```
[Sources] Loaded 2 source(s):
  - articles/blog (update=true, delete=true) - Public-facing blog posts
  - articles/handbook (update=false, delete=false) - Internal company handbook (read-only)
```

**5. Use the new source:**
```bash
curl -X POST http://localhost:3000/api/articles/list \\
  -H "Content-Type: application/json" \\
  -d '{"source": "handbook", "pageSize": 10}'
```

## Environment-Specific Configuration

### Development

Keep `sources.config.json` with full read/write access:

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

Create `sources.config.production.json` with read-only access:

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
        "update": false,
        "delete": false
      },
      "description": "Public-facing blog posts (read-only in production)"
    }
  ]
}
```

**Deploy to production:**
```bash
# Vercel
vercel env add NOTION_SOURCES_CONFIG production
# Value: ./sources.config.production.json

# Or in deployment script
NOTION_SOURCES_CONFIG=./sources.config.production.json bun start
```

## Troubleshooting

### Source Not Loading After Migration

**Symptom:**
```
[Sources] Skipping source 'blog': database ID not configured
```

**Cause:** Environment variable not set

**Fix:**
```bash
# Check env var
echo $NOTION_DB_ARTICLES_BLOG

# Add to .env if missing
echo "NOTION_DB_ARTICLES_BLOG=your-database-id" >> .env
```

### Configuration File Not Found

**Symptom:**
```
[Sources] Failed to load config from ./sources.config.json: ENOENT
```

**Cause:** Config file missing

**Fix:**
```bash
# Copy from example
cp sources.config.example.json sources.config.json

# Or create new
cat > sources.config.json << EOF
{
  "version": "1.0",
  "sources": [
    {
      "alias": "blog",
      "kind": "articles",
      "databaseId": "\${NOTION_DB_ARTICLES_BLOG}"
    }
  ]
}
EOF
```

### Tests Failing After Migration

**Symptom:** Tests that previously passed now fail

**Cause:** Usually unrelated to config migration (config system is backward-compatible)

**Fix:**
```bash
# Run single test to isolate issue
bun test test/articles.router.integration.test.ts

# Check if env vars are loaded in test
bun test 2>&1 | grep "Sources"
```

## Rollback (If Needed)

If you need to rollback to hardcoded sources:

1. The old code is still in git history
2. Checkout the previous version of `src/domain/registry/sources.ts`
3. Remove config files

**However**, this is **not recommended** as the config system is strictly better.

## Comparison Table

| Feature | Hardcoded | Config-Based |
|---------|-----------|--------------|
| **Add Source** | Edit TypeScript code | Edit JSON file |
| **Environment-Specific** | Separate codebases | Separate config files |
| **Validation** | Runtime errors only | Schema + startup validation |
| **Documentation** | Code comments | Inline descriptions |
| **Type Safety** | TypeScript | JSON Schema + Effect Schema |
| **Hot Reload** | Restart + recompile | Restart only |
| **Version Control** | Code changes | Config changes |
| **Error Messages** | Generic | Specific and helpful |
| **Multi-Tenant** | Not feasible | Possible with dynamic configs |

## Next Steps

1. **Review** `docs/SOURCES_CONFIG.md` for full configuration reference
2. **Customize** `sources.config.json` for your needs
3. **Create** environment-specific configs
4. **Add** additional sources as needed
5. **Deploy** with confidence

## Getting Help

- **Configuration Reference**: `docs/SOURCES_CONFIG.md`
- **Schema Adapter Guide**: `docs/SchemaAdapter.md`
- **Development Guide**: `docs/DEVELOPMENT.md`
- **Production Deployment**: `docs/PRODUCTION.md`

## Feedback

If you encounter issues during migration, please:
1. Check the troubleshooting section above
2. Verify startup logs for specific error messages
3. Review the example configs in this repository
4. Open an issue with detailed error logs

---

**Migration Complete!** 🎉

You're now using the modern, flexible JSON configuration system. Enjoy easier source management and deployment!
