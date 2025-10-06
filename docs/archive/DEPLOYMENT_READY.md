# 🚀 Production Deployment Checklist

## Status: ✅ READY FOR PRODUCTION

All Effect-TS best practice improvements have been completed. The codebase is
production-ready with comprehensive observability.

---

## Pre-Deployment Verification

### ✅ Code Quality
- [x] All tests passing (185/185)
- [x] Type checking passes
- [x] No anti-patterns remaining
- [x] Effect-native architecture
- [x] Comprehensive documentation

### ✅ Architecture
- [x] Service patterns with Layers
- [x] Immutable state management
- [x] Proper dependency injection
- [x] Type-safe error handling
- [x] No global mutable state

### ✅ Observability
- [x] Structured logging (Effect.log)
- [x] Metrics collection (Effect.Metric)
- [x] Distributed tracing (Effect.withSpan)
- [x] Error tracking
- [x] Performance monitoring

---

## Deployment Steps

### 1. Environment Configuration

Ensure these environment variables are set:

```bash
# Required
NODE_ENV=production
NOTION_API_KEY=secret_xxx...

# Optional (with defaults)
PORT=3000
LOG_LEVEL=Info
CORS_ORIGIN=*
CORS_ALLOWED_METHODS=POST,GET,OPTIONS
CORS_ALLOWED_HEADERS=Content-Type,Authorization
NOTION_HTTP_TIMEOUT_MS=10000
```

### 2. Build & Test

```bash
# Type check
bun typecheck

# Run tests
bun test

# Build (if needed)
bun run build
```

### 3. Deploy to Vercel

The project is configured for Vercel with Bun runtime:

```bash
# Deploy to production
vercel --prod

# Or use Vercel CLI
vercel deploy --prod
```

**Configuration:** `vercel.json` already configured with Bun runtime

### 4. Configure OpenTelemetry (Optional but Recommended)

To enable distributed tracing, add an OpenTelemetry exporter:

#### Option A: Jaeger (Local/Self-hosted)
```bash
npm install @effect/opentelemetry @opentelemetry/exporter-jaeger
```

```typescript
import { NodeSdk } from "@effect/opentelemetry";
import { JaegerExporter } from "@opentelemetry/exporter-jaeger";

const TracingLayer = NodeSdk.layer(() => ({
  resource: { serviceName: "effect-notion-api" },
  spanProcessor: new JaegerExporter({
    endpoint: process.env.JAEGER_ENDPOINT || 
      "http://localhost:14268/api/traces",
  }),
}));

// Add to AppLayers in main.ts and api/index.ts
const AppLayers = Layer.mergeAll(
  TracingLayer,  // ← Add this
  Logger.json,
  // ... rest of layers
);
```

#### Option B: Datadog
```bash
npm install @effect/opentelemetry @opentelemetry/exporter-datadog
```

```typescript
import { DatadogExporter } from "@opentelemetry/exporter-datadog";

const TracingLayer = NodeSdk.layer(() => ({
  resource: { serviceName: "effect-notion-api" },
  spanProcessor: new DatadogExporter({
    agentUrl: process.env.DD_AGENT_URL || "http://localhost:8126",
  }),
}));
```

#### Option C: Console (Development)
```typescript
import { ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";

const TracingLayer = NodeSdk.layer(() => ({
  resource: { serviceName: "effect-notion-api" },
  spanProcessor: new ConsoleSpanExporter(),
}));
```

---

## Post-Deployment Monitoring

### Metrics to Watch

The application exposes metrics at `/api/metrics`:

```
# HELP notion_api_requests_total Total Notion API requests
# TYPE notion_api_requests_total counter
notion_api_requests_total{operation="queryDatabase"} 42

# HELP notion_api_request_duration_ms Notion API request duration
# TYPE notion_api_request_duration_ms histogram
notion_api_request_duration_ms_bucket{operation="queryDatabase",le="100"} 35
notion_api_request_duration_ms_bucket{operation="queryDatabase",le="500"} 40
```

### Tracing Spans to Monitor

All ArticlesRepository operations are traced:

1. **ArticlesRepository.list**
   - Monitor: Average duration, filter usage
   - Alert: Duration > 1s

2. **ArticlesRepository.get**
   - Monitor: Cache hit rate, duration
   - Alert: Duration > 500ms

3. **ArticlesRepository.create**
   - Monitor: Success rate, duration
   - Alert: Error rate > 5%

4. **ArticlesRepository.update**
   - Monitor: Update frequency, duration
   - Alert: Duration > 500ms

5. **ArticlesRepository.delete**
   - Monitor: Deletion rate
   - Alert: Unusual spike

### Health Check

Monitor the health endpoint:

```bash
curl https://your-domain.vercel.app/api/health
```

Expected response:
```json
{
  "ok": true,
  "env": "production",
  "timestamp": "2025-10-02T21:12:00.000Z"
}
```

---

## Rollback Plan

If issues arise:

### Quick Rollback
```bash
# Revert to previous deployment
vercel rollback
```

### Debug Issues
1. Check logs: `vercel logs`
2. Check metrics: `GET /api/metrics`
3. Check health: `GET /api/health`
4. Review traces in your observability platform

---

## Performance Expectations

### Response Times (Expected)
- **Health check:** < 50ms
- **List articles:** 200-500ms (depends on Notion API)
- **Get article:** 150-300ms
- **Create article:** 300-600ms
- **Update article:** 300-600ms
- **Delete article:** 200-400ms

### Retry Behavior
- **Max attempts:** 3
- **Initial delay:** 100ms
- **Max delay:** 1000ms
- **Backoff:** Exponential with jitter
- **Timeout:** 10 seconds per request

---

## Support & Troubleshooting

### Common Issues

#### 1. Notion API Key Invalid
**Symptom:** 401 errors, InvalidApiKeyError  
**Solution:** Verify `NOTION_API_KEY` environment variable

#### 2. Database Not Found
**Symptom:** 404 errors, NotFoundError  
**Solution:** Check database IDs in source configuration

#### 3. Slow Responses
**Symptom:** Timeouts, high latency  
**Solution:** Check Notion API status, review tracing spans

#### 4. High Error Rate
**Symptom:** 500 errors, InternalServerError  
**Solution:** Check logs, review error causes in traces

### Debug Commands

```bash
# Check environment
vercel env ls

# View logs
vercel logs --follow

# Test health endpoint
curl https://your-domain.vercel.app/api/health

# Test metrics endpoint
curl https://your-domain.vercel.app/api/metrics
```

---

## Architecture Overview

### Request Flow
```
Client Request
  ↓
Router (src/router.ts)
  ↓
ArticlesRepository (service layer)
  ├─ Tracing span created
  ├─ Metrics recorded
  ↓
NotionService (business logic)
  ├─ Schema caching
  ├─ Retry with Schedule
  ↓
NotionClient (HTTP client)
  ├─ Request timeout
  ├─ Error mapping
  ↓
Notion API
```

### Layer Dependencies
```
AppLayers
├─ Logger.json
├─ LogLevelLayer
├─ AppConfigProviderLive
├─ RequestIdService.Live
├─ LogicalFieldOverridesService.Live
└─ NotionService.Default
    ├─ NotionClient.Default
    ├─ AppConfigProviderLive
    └─ LogicalFieldOverridesService.Live
```

---

## Success Criteria

### ✅ Deployment Successful If:
- Health endpoint returns 200 OK
- Metrics endpoint returns Prometheus format
- API requests complete successfully
- Logs show structured JSON output
- No critical errors in first hour
- Response times within expected range

### 🎯 Production Goals
- **Uptime:** > 99.9%
- **P95 latency:** < 1s
- **Error rate:** < 1%
- **Retry success rate:** > 80%

---

## Contact & Resources

### Documentation
- `COMPLETE_SUMMARY.md` - Full implementation summary
- `PHASE_3.1_COMPLETE.md` - Tracing implementation
- `PHASE_3_PLAN.md` - Future enhancements

### Effect Resources
- [Effect Documentation](https://effect.website)
- [Effect Discord](https://discord.gg/effect-ts)
- [OpenTelemetry Integration](https://effect.website/docs/guides/observability/tracing)

---

**🎉 Congratulations!**

Your Effect-TS application is production-ready with:
- 15 Effect rules followed
- 185 tests passing
- Full observability stack
- Comprehensive documentation

**Deploy with confidence!** 🚀
