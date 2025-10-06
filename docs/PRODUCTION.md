# Production Deployment Guide

This guide covers deploying effect-notion to production with best practices for security, monitoring, and performance.

## Table of Contents

- [Pre-Deployment Checklist](#pre-deployment-checklist)
- [Vercel Deployment](#vercel-deployment)
- [Environment Configuration](#environment-configuration)
- [Monitoring & Observability](#monitoring--observability)
- [Security Considerations](#security-considerations)
- [Performance Optimization](#performance-optimization)
- [Troubleshooting](#troubleshooting)

## Pre-Deployment Checklist

Before deploying to production, verify:

- [ ] All tests passing: `bun test`
- [ ] TypeScript compilation clean: `bun run build`
- [ ] Environment variables configured
- [ ] Notion API key has appropriate permissions
- [ ] CORS origins configured for your domain
- [ ] Error handling tested with invalid inputs
- [ ] Rate limiting understood (Notion API limits)
- [ ] Monitoring strategy in place

## Vercel Deployment

### Initial Setup

1. **Install Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **Link project**
   ```bash
   vercel link
   ```

3. **Configure environment variables**
   ```bash
   vercel env add NOTION_API_KEY production
   vercel env add NOTION_DB_ARTICLES_BLOG production
   # Add other env vars as needed
   ```

4. **Deploy**
   ```bash
   vercel --prod
   ```

### Vercel Configuration

The project uses `vercel.json` for routing:

```json
{
  "version": 2,
  "functions": {
    "api/index.ts": {
      "runtime": "@vercel/node@3.2.20"
    }
  },
  "routes": [
    { "src": "/api/(.*)", "dest": "api/index.ts" },
    { "src": "/(.*)", "dest": "api/index.ts" }
  ]
}
```

**Runtime Notes:**
- Uses Node.js runtime (not Bun) for Vercel compatibility
- Supports ES modules with `.js` extensions
- Cold start time: ~200-500ms

### Continuous Deployment

**GitHub Integration:**
1. Connect repository to Vercel
2. Configure production branch (usually `main`)
3. Enable automatic deployments
4. Set environment variables in Vercel dashboard

**Deployment Triggers:**
- Push to `main` → production deployment
- Push to other branches → preview deployment
- Pull requests → preview deployments with unique URLs

## Environment Configuration

### Required Variables

```bash
# Production .env (set in Vercel dashboard)
NODE_ENV=production
NOTION_API_KEY=secret_xxxxxxxxxxxxx

# Optional but recommended
CORS_ORIGIN=https://yourdomain.com
LOG_LEVEL=Info
NOTION_HTTP_TIMEOUT_MS=10000
```

### Environment-Specific Configs

**Development:**
```bash
NODE_ENV=development
PORT=3000
CORS_ORIGIN=*
LOG_LEVEL=Debug
```

**Production:**
```bash
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
LOG_LEVEL=Info
```

### Validation

The app validates configuration at startup:

```typescript
// NOTION_API_KEY required in production
if (cfg.env === "production" && !cfg.notionApiKey) {
  throw new ConfigValidationError({
    reason: "NOTION_API_KEY is required in production"
  });
}
```

**Startup errors** will be visible in Vercel logs.

## Monitoring & Observability

### Built-in Metrics

**Endpoint:** `https://your-app.vercel.app/api/metrics`

**Available Metrics:**
```
# Request counters
notion_api_requests_total{} 1234
notion_api_success_total{} 1200
notion_api_errors_total{} 34

# Latency histogram
notion_api_duration_ms_bucket{le="10"} 450
notion_api_duration_ms_bucket{le="50"} 980
notion_api_duration_ms_bucket{le="100"} 1150
notion_api_duration_ms_sum{} 45670
notion_api_duration_ms_count{} 1234
```

### Prometheus Integration

**Option 1: Scrape Endpoint**
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'effect-notion'
    static_configs:
      - targets: ['your-app.vercel.app']
    metrics_path: '/api/metrics'
    scheme: https
```

**Option 2: Push to Gateway**
```typescript
// Add to api/index.ts (optional)
import { pushToGateway } from './metrics-push';

// In handler or scheduled job
await pushToGateway(metrics, {
  jobName: 'effect-notion',
  gatewayUrl: process.env.PROMETHEUS_GATEWAY
});
```

### Structured Logging

All logs are JSON-formatted with request IDs:

```json
{
  "message": "Notion API request failed: NotFoundError",
  "logLevel": "WARN",
  "timestamp": "2025-10-06T12:34:56.789Z",
  "requestId": "abc123xyz",
  "fiberId": "#42"
}
```

**View logs in Vercel:**
```bash
vercel logs --follow
```

**Filter by error:**
```bash
vercel logs | grep '"logLevel":"ERROR"'
```

### Request Tracing

Every request includes correlation ID:

**Request Header:**
```
GET /api/health
x-request-id: user-provided-id (optional)
```

**Response Header:**
```
HTTP/1.1 200 OK
x-request-id: abc123xyz
```

**Use for debugging:**
1. Client sends custom request ID
2. Server includes it in all logs
3. Search logs by request ID for full trace

### OpenTelemetry (Advanced)

**Setup for distributed tracing:**

1. **Install dependencies:**
   ```bash
   bun add @effect/opentelemetry @opentelemetry/sdk-node
   bun add @opentelemetry/exporter-jaeger
   # or @opentelemetry/exporter-otlp-grpc
   ```

2. **Configure exporter:**
   ```typescript
   // src/tracing.ts
   import { NodeSDK } from '@opentelemetry/sdk-node';
   import { JaegerExporter } from '@opentelemetry/exporter-jaeger';

   const sdk = new NodeSDK({
     traceExporter: new JaegerExporter({
       endpoint: process.env.JAEGER_ENDPOINT
     }),
     serviceName: 'effect-notion'
   });

   sdk.start();
   ```

3. **Spans are already instrumented:**
   ```typescript
   // Existing code automatically creates spans
   Effect.withSpan("list-articles", {
     attributes: { databaseId, pageSize }
   })
   ```

**Integrations:**
- Jaeger: Self-hosted tracing
- Datadog: `@opentelemetry/exporter-datadog`
- Honeycomb: `@opentelemetry/exporter-otlp-http`
- New Relic: `@newrelic/opentelemetry-exporter`

## Security Considerations

### API Key Protection

**✅ DO:**
- Store `NOTION_API_KEY` in Vercel environment variables
- Use Vercel's encrypted storage
- Rotate keys periodically
- Use separate keys for dev/staging/prod

**❌ DON'T:**
- Commit API keys to git
- Expose keys in client-side code
- Log API keys in error messages
- Share keys between environments

### CORS Configuration

**Strict Production CORS:**
```bash
# Allow specific origins only
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com

# Methods
CORS_ALLOWED_METHODS=POST,GET,OPTIONS

# Headers
CORS_ALLOWED_HEADERS=Content-Type,Authorization
```

**Wildcard (Development Only):**
```bash
CORS_ORIGIN=*  # ⚠️ Never use in production!
```

### Input Validation

All inputs are validated with Effect Schema:

```typescript
// Automatic validation
const body = yield* HttpServerRequest.schemaBodyJson(MyRequestSchema);
// Throws ParseError if invalid

// Content length limits
content: NonEmptyString.pipe(
  Schema.maxLength(50 * 1024) // 50KB max
)
```

**Validation Errors** return 400 Bad Request with details.

### Rate Limiting

**Notion API Limits:**
- 3 requests per second average
- Burst up to 10 requests
- 429 errors include `Retry-After` header

**Built-in Retry Logic:**
```typescript
// Automatic retry with exponential backoff
const notionRetrySchedule = Schedule.exponential("1 second").pipe(
  Schedule.compose(Schedule.recurs(2)), // 3 total attempts
  Schedule.jittered
);
```

**Client-Side Recommendation:**
Implement rate limiting in your frontend to avoid overwhelming the proxy.

### Error Information Disclosure

**Production errors** return safe messages:

```json
{
  "error": "Internal Server Error",
  "code": "InternalServerError",
  "requestId": "abc123",
  "detail": "An error occurred"  // Generic message
}
```

**Sensitive info** (stack traces, internal paths) only logged server-side.

## Performance Optimization

### Caching Strategy

**Schema Cache:**
- **Size:** Max 100 database schemas
- **TTL:** 10 minutes
- **Eviction:** LRU (Least Recently Used)
- **Stale Fallback:** Serves stale data if Notion API fails

**Cache Warming (Optional):**
```typescript
// Warm cache on startup
const warmCache = Effect.gen(function* () {
  const notionService = yield* NotionService;
  const commonDatabases = [
    process.env.NOTION_DB_ARTICLES_BLOG,
    // Add more
  ].filter(Boolean);

  yield* Effect.forEach(
    commonDatabases,
    (id) => notionService.getDatabaseSchema(id),
    { concurrency: 3 }
  );
});
```

### Concurrent Processing

**Batch Operations:**
```typescript
// Process multiple items concurrently
yield* Effect.forEach(
  items,
  (item) => processItem(item),
  { concurrency: 5 } // Limit concurrent requests
);
```

**Notion API Considerations:**
- Keep concurrency ≤ 3 to respect rate limits
- Use batching for large operations
- Consider pagination for large datasets

### Cold Start Optimization

**Vercel Serverless:**
- **Cold start:** ~200-500ms
- **Warm start:** ~10-50ms
- **Keep-Alive:** Vercel keeps functions warm with traffic

**Optimization Tips:**
1. Minimize dependencies (tree-shaking)
2. Use dynamic imports for optional features
3. Pre-compute constants at module level
4. Keep bundle size < 50MB

### Response Compression

Vercel automatically enables gzip/brotli for responses > 1KB.

**Manual optimization:**
```typescript
// Paginate large responses
const pageSize = Math.min(params.pageSize ?? 20, 100);
```

### Database Query Optimization

**Notion API Best Practices:**
1. **Use filters** to reduce data transferred:
   ```typescript
   filter: {
     and: [
       { property: "Status", select: { equals: "Published" } }
     ]
   }
   ```

2. **Request only needed fields** (not yet supported by Notion API)

3. **Use pagination** for large datasets:
   ```typescript
   pageSize: 20,
   startCursor: nextCursor
   ```

## Troubleshooting

### Deployment Issues

**Issue:** `Error: Cannot find module`

**Solution:** Ensure imports use `.js` extensions:
```typescript
import { foo } from './helpers.js'; // ✅
```

**Issue:** Environment variables not loaded

**Solution:** Set in Vercel dashboard, not `.env` file:
```bash
vercel env add NOTION_API_KEY production
```

### Runtime Errors

**Issue:** 500 Internal Server Error

**Check:**
1. Vercel logs: `vercel logs --follow`
2. Error includes `requestId` for correlation
3. Check Notion API status: https://status.notion.so/

**Issue:** CORS errors in browser

**Solution:**
```bash
# Verify CORS_ORIGIN includes your domain
vercel env ls
vercel env add CORS_ORIGIN production
# Enter: https://yourdomain.com
```

### Performance Issues

**Issue:** Slow response times (>2s)

**Diagnose:**
1. Check metrics: `curl https://your-app/api/metrics`
2. Look for high `notion_api_duration_ms` values
3. Check Notion API rate limiting (429 errors)

**Solutions:**
- Reduce page size
- Enable caching
- Implement client-side caching
- Consider background processing for heavy operations

**Issue:** High error rate

**Check:**
1. Metrics endpoint for error counters
2. Logs for specific error types
3. Notion API status

### Cache Issues

**Issue:** Stale data returned

**Expected:** Cache TTL is 10 minutes

**Force refresh:**
```bash
# Redeploy to clear cache
vercel --prod

# Or invalidate programmatically
POST /api/invalidate-cache
{ "databaseId": "xxx" }
```

## Health Checks

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-10-06T12:34:56.789Z"
}
```

**Use for:**
- Uptime monitoring (UptimeRobot, Pingdom)
- Load balancer health checks
- Deployment verification

**Monitoring Setup:**
```bash
# Example: Monitor every 5 minutes
curl -X POST https://api.uptimerobot.com/v2/newMonitor \
  -d "api_key=$UPTIME_ROBOT_KEY" \
  -d "friendly_name=effect-notion" \
  -d "url=https://your-app.vercel.app/api/health" \
  -d "type=1" \
  -d "interval=300"
```

## Scaling Considerations

### Vercel Limits

**Free Tier:**
- 100GB bandwidth/month
- 100 hours execution time/month
- 6,000 function invocations/day

**Pro Tier:**
- 1TB bandwidth/month
- Unlimited execution time
- Unlimited invocations

**Enterprise:** Custom limits

### Database Considerations

Notion API limits apply per integration, not per deployment:
- **3 req/sec average** across all Vercel instances
- Consider implementing request queuing for high traffic

### Multi-Region Deployment

Vercel deploys to edge regions automatically:
- Functions run in nearest region
- Notion API calls go to Notion's servers (US-based)
- Latency: ~100-300ms total (including Notion API)

## Maintenance

### Regular Tasks

**Weekly:**
- [ ] Check error logs for anomalies
- [ ] Review metrics for performance trends
- [ ] Verify cache hit rates

**Monthly:**
- [ ] Review and rotate API keys (if needed)
- [ ] Update dependencies: `bun update`
- [ ] Check Notion API changelog for breaking changes

**Quarterly:**
- [ ] Review and optimize database queries
- [ ] Analyze usage patterns for caching improvements
- [ ] Audit CORS and security settings

### Backup & Disaster Recovery

**Notion Data:**
- Notion handles database backups
- Export important databases regularly via Notion UI

**Configuration:**
- Store `vercel.json` in git
- Document environment variables
- Keep `.env.example` updated

**Recovery Plan:**
1. Redeploy from git: `vercel --prod`
2. Restore environment variables from documentation
3. Verify health endpoint
4. Test critical paths

## Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Notion API Limits](https://developers.notion.com/reference/request-limits)
- [Effect Metrics Guide](https://effect.website/docs/observability/metrics)
- [OpenTelemetry Setup](https://opentelemetry.io/docs/instrumentation/js/)
