# Health Check Script

A comprehensive health check utility for testing live proxy server 
deployments.

## Overview

The health check script validates that your deployed Effect-Notion proxy 
server is functioning correctly by testing multiple aspects of the API:

- **Health Endpoint**: Verifies the `/api/health` endpoint responds 
  correctly
- **CORS Configuration**: Tests CORS preflight requests
- **404 Handling**: Ensures proper error responses for invalid routes
- **Request ID Tracking**: Validates request ID headers are present

## Usage

### Basic Usage

Test the default local server:
```bash
bun run health-check
```

### Test a Deployed Server

Test your production deployment:
```bash
bun run health-check https://your-app.vercel.app
```

Test a staging environment:
```bash
bun run health-check https://your-app-staging.vercel.app
```

### Direct Script Execution

You can also run the script directly:
```bash
bun scripts/health-check.ts http://localhost:3000
```

## Output

The script provides colored, formatted output showing the status of each 
check:

```
────────────────────────────────────────────────────────────
Health Check for Live Proxy Server
Target: https://your-app.vercel.app
Timeout: 10000ms
────────────────────────────────────────────────────────────

✓ Health Endpoint [245ms]
  Status: 200
  Details: {
           "ok": true,
           "env": "production",
           "hasApiKey": true,
           "checkedDatabaseId": "21ebc803...",
           "notionOk": true,
           "error": null
         }

✓ CORS Preflight [89ms]
  Status: 204
  Details: {
           "access-control-allow-origin": "*",
           "access-control-allow-methods": "POST,GET,OPTIONS",
           "access-control-allow-headers": "Content-Type,Authorization"
         }

✓ 404 Handling [123ms]
  Status: 404
  Details: {
           "expectedStatus": 404,
           "actualStatus": 404
         }

✓ Request ID Header [156ms]
  Status: 200
  Details: {
           "x-request-id": "abc123xyz"
         }

────────────────────────────────────────────────────────────
✓ All 4 checks passed
────────────────────────────────────────────────────────────
```

## Exit Codes

- **0**: All checks passed
- **1**: One or more checks failed

This makes the script suitable for use in CI/CD pipelines:

```bash
# In your CI pipeline
bun run health-check https://your-app.vercel.app || exit 1
```

## Configuration

### Timeout

The default timeout is 10 seconds. To modify, edit the `TIMEOUT_MS` 
constant in `scripts/health-check.ts`:

```typescript
const TIMEOUT_MS = 10000; // 10 seconds
```

### Additional Checks

You can extend the script by adding new check functions following the 
pattern:

```typescript
const checkCustomEndpoint = (
  baseUrl: string
): Effect.Effect<CheckResult, never> =>
  Effect.tryPromise({
    try: async () => {
      const start = Date.now();
      const url = `${baseUrl}/api/your-endpoint`;
      
      const response = await fetch(url);
      const duration = Date.now() - start;
      
      return {
        name: "Custom Endpoint",
        success: response.status === 200,
        status: response.status,
        duration,
        details: { /* your details */ },
      } as CheckResult;
    },
    catch: (error) => error,
  }).pipe(
    Effect.catchAll((error) =>
      Effect.succeed({
        name: "Custom Endpoint",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
      } as CheckResult)
    )
  );
```

## Integration with CI/CD

### GitHub Actions

```yaml
name: Health Check
on:
  deployment_status:

jobs:
  health-check:
    runs-on: ubuntu-latest
    if: github.event.deployment_status.state == 'success'
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run health-check ${{ 
          github.event.deployment_status.target_url 
        }}
```

### Vercel Post-Deploy Hook

Add to your `package.json`:

```json
{
  "scripts": {
    "postdeploy": "bun run health-check $VERCEL_URL"
  }
}
```

### Monitoring Integration

Use with monitoring services like UptimeRobot or Pingdom:

```bash
# Cron job for periodic health checks
*/5 * * * * cd /path/to/project && \
  bun run health-check https://your-app.vercel.app >> \
  /var/log/health-check.log 2>&1
```

## Troubleshooting

### Connection Refused

```
✗ Health Endpoint [0ms]
  Error: The operation was aborted.
```

**Causes:**
- Server is not running
- Incorrect URL
- Network connectivity issues

**Solutions:**
- Verify the server is deployed and running
- Check the URL is correct
- Test network connectivity: `curl https://your-app.vercel.app`

### CORS Failures

```
✗ CORS Preflight [234ms]
  Status: 200
```

**Cause:** Server not returning 204 for OPTIONS requests

**Solution:** Verify CORS middleware is configured in `api/index.ts`

### Health Endpoint Returns 503

```
✓ Health Endpoint [345ms]
  Status: 503
  Details: {
           "ok": false,
           "hasApiKey": false,
           ...
         }
```

**Causes:**
- Missing `NOTION_API_KEY` environment variable
- Notion API connectivity issues
- Invalid API key

**Solutions:**
- Set environment variables in Vercel dashboard
- Check Notion API status: https://status.notion.so/
- Verify API key has correct permissions

### Timeout Errors

```
✗ Health Endpoint [10000ms]
  Error: The operation was aborted.
```

**Causes:**
- Server is slow to respond
- Cold start taking too long
- Network latency

**Solutions:**
- Increase `TIMEOUT_MS` in the script
- Warm up the serverless function first
- Check server logs for performance issues

## Best Practices

1. **Run After Deployment**: Always run health checks after deploying 
   to verify the deployment succeeded

2. **Monitor Regularly**: Set up periodic health checks to catch issues 
   early

3. **Check All Environments**: Run health checks on staging before 
   promoting to production

4. **Log Results**: Keep a log of health check results for trend 
   analysis

5. **Alert on Failures**: Integrate with alerting systems to notify 
   when checks fail

## Related Documentation

- [Production Deployment Guide](./PRODUCTION.md)
- [API Documentation](../README.md#api-endpoints)
- [Monitoring & Observability](./PRODUCTION.md#monitoring--observability)

## Effect Patterns Used

This script demonstrates several Effect best practices:

- **Effect.tryPromise**: Wrapping async operations safely
- **Effect.catchAll**: Comprehensive error handling
- **Effect.gen**: Sequential effect composition
- **Effect.runPromise**: Executing effects as promises

For more on Effect patterns, see the 
[Effect documentation](https://effect.website/).
