# Metrics and Resilience Features

This document describes the performance monitoring and advanced error handling features implemented in the Effect Notion application.

## Overview

The application now includes:
- **Performance Monitoring**: Metrics collection and monitoring
- **Advanced Error Handling**: Circuit breakers and retry strategies

These features are implemented using simplified, non-Effect-based implementations to ensure reliability and ease of maintenance.

## Performance Monitoring

### Simple Metrics Service

The `SimpleMetricsService` provides basic metrics collection capabilities:

- **Counters**: Track total counts of events (e.g., API requests, errors)
- **Durations**: Record timing information (e.g., API call latency)
- **Gauges**: Store current values (e.g., active connections, circuit breaker state)

#### Usage

```typescript
import { globalMetrics } from "./src/metrics/simple.js";

// Increment counters
globalMetrics.incrementCounter("http_requests", 1);
globalMetrics.incrementCounter("api_calls_total", 1);

// Record durations
globalMetrics.recordDuration("api_call", 150); // 150ms
globalMetrics.recordDuration("database_query", 25);

// Set gauges
globalMetrics.setGauge("active_connections", 15);
globalMetrics.setGauge("memory_usage_mb", 128);
```

#### Metrics Endpoint

Metrics are exposed via the `/api/metrics` endpoint in Prometheus-compatible format:

```bash
# View metrics
curl http://localhost:3000/api/metrics

# Example output:
http_requests_total 42
api_calls_total 156
api_call_avg_ms 125
active_connections 15
```

## Advanced Error Handling

### Circuit Breaker Pattern

The `SimpleCircuitBreaker` implements the circuit breaker pattern to prevent cascading failures:

- **Closed State**: Normal operation, requests pass through
- **Open State**: Circuit is open, requests fail fast
- **Half-Open State**: Testing if service has recovered

#### Configuration

```typescript
import { SimpleCircuitBreaker, DefaultCircuitBreakerConfig } from "./src/resilience/simple.js";

const circuitBreaker = new SimpleCircuitBreaker({
  failureThreshold: 5,        // Open circuit after 5 failures
  recoveryTimeout: 30000,     // Wait 30 seconds before testing recovery
  successThreshold: 3,        // Close circuit after 3 successful calls
});
```

#### Usage

```typescript
try {
  const result = await circuitBreaker.execute(async () => {
    // Your potentially failing operation
    return await apiCall();
  });
} catch (error) {
  if (error.message === "Circuit breaker is open") {
    // Handle circuit breaker open state
  } else {
    // Handle actual operation error
  }
}
```

### Retry Strategy

The `SimpleRetryStrategy` provides configurable retry logic with exponential backoff:

- **Exponential Backoff**: Delays increase exponentially between attempts
- **Jitter**: Random variation to prevent thundering herd
- **Configurable**: Customize retry attempts, delays, and error types

#### Configuration

```typescript
import { SimpleRetryStrategy, DefaultRetryConfig } from "./src/resilience/simpleRetry.js";

const retryStrategy = new SimpleRetryStrategy({
  maxAttempts: 3,           // Try up to 3 times
  baseDelay: 1000,          // Start with 1 second delay
  maxDelay: 10000,          // Cap delay at 10 seconds
  backoffMultiplier: 2,     // Double delay each attempt
  jitterFactor: 0.1,        // Add 10% random jitter
  retryableErrors: ["timeout", "network", "service_unavailable"]
});
```

#### Usage

```typescript
try {
  const result = await retryStrategy.execute(async () => {
    // Your operation that might fail temporarily
    return await apiCall();
  });
} catch (error) {
  // All retry attempts failed
  console.error("Operation failed after all retries:", error);
}
```

## Integration with NotionClient

The metrics and resilience features are automatically integrated into all Notion API calls:

### Automatic Metrics Collection

Every Notion API call automatically records:
- Request counts (total, per operation)
- Duration metrics (success, error)
- Error counts by type
- Circuit breaker state

### Automatic Resilience

All Notion API calls are wrapped with:
- Circuit breaker protection
- Retry strategy for transient failures
- Automatic timeout handling

## Configuration

### Environment Variables

No additional environment variables are required. The features use sensible defaults that can be customized in code.

### Customization

You can customize the behavior by modifying the instances in `src/services/NotionClient/helpers.ts`:

```typescript
// Custom circuit breaker configuration
const notionCircuitBreaker = new SimpleCircuitBreaker({
  failureThreshold: 10,      // More tolerant
  recoveryTimeout: 60000,    // Longer recovery time
  successThreshold: 5,       // More successful calls to close
});

// Custom retry configuration
const notionRetryStrategy = new SimpleRetryStrategy({
  maxAttempts: 5,           // More retry attempts
  baseDelay: 500,           // Faster initial retry
  maxDelay: 5000,           // Shorter max delay
});
```

## Monitoring and Observability

### Metrics Dashboard

The `/api/metrics` endpoint provides real-time visibility into:
- API performance and reliability
- Error rates and types
- Circuit breaker health
- System resource usage

### Logging Integration

All resilience features integrate with the existing logging system:
- Circuit breaker state changes are logged
- Retry attempts are tracked
- Error patterns are recorded

### Health Checks

Circuit breaker state is exposed as a gauge metric:
- `notion_circuit_breaker_state`: 1 = closed, 0 = open/half-open

## Testing

### Unit Tests

```bash
# Run resilience tests
bun test test/simple.metrics.test.ts

# Run metrics endpoint tests
bun test test/metrics.endpoint.test.ts
```

### Demonstration

```bash
# Run the demonstration script
bun run demo/metrics-resilience-demo.ts
```

## Best Practices

### Circuit Breaker

1. **Set appropriate thresholds**: Balance between responsiveness and stability
2. **Monitor state changes**: Track circuit breaker health in your monitoring
3. **Test failure scenarios**: Ensure circuit breaker opens when expected

### Retry Strategy

1. **Use exponential backoff**: Prevents overwhelming failing services
2. **Add jitter**: Prevents synchronized retry attempts
3. **Limit retry attempts**: Avoid infinite retry loops

### Metrics

1. **Use consistent naming**: Follow Prometheus naming conventions
2. **Reset metrics in tests**: Ensure clean test state
3. **Monitor key metrics**: Focus on business-critical measurements

## Troubleshooting

### Common Issues

1. **Circuit breaker stuck open**: Check recovery timeout and success threshold
2. **High retry counts**: Investigate underlying service issues
3. **Missing metrics**: Verify metrics are being recorded in your code

### Debug Mode

Enable debug logging to see detailed resilience behavior:

```typescript
// Add to your logging configuration
Effect.logLevel("DEBUG");
```

## Future Enhancements

Potential improvements for future versions:
- **Distributed metrics**: Support for metrics aggregation across instances
- **Advanced circuit breakers**: Sliding window, adaptive thresholds
- **Metrics persistence**: Long-term storage and historical analysis
- **Alerting**: Automatic notifications for circuit breaker state changes
