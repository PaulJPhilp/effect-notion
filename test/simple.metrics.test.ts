import { describe, expect, it } from "vitest";
import { SimpleMetricsService } from "../src/metrics/simple.js";
import { SimpleCircuitBreaker } from "../src/resilience/simple.js";
import { SimpleRetryStrategy } from "../src/resilience/simpleRetry.js";

describe("Simple Metrics and Resilience", () => {
  it("should record metrics correctly", () => {
    const metrics = new SimpleMetricsService();
    
    // Test counters
    metrics.incrementCounter("http_requests", 1);
    metrics.incrementCounter("http_requests", 2);
    expect(metrics.getMetrics()["http_requests_total"]).toBe(3);
    
    // Test durations
    metrics.recordDuration("api_call", 100);
    metrics.recordDuration("api_call", 200);
    expect(metrics.getMetrics()["api_call_avg_ms"]).toBe(150);
    expect(metrics.getMetrics()["api_call_count"]).toBe(2);
    
    // Test gauges
    metrics.setGauge("active_connections", 5);
    expect(metrics.getMetrics()["active_connections"]).toBe(5);
  });

  it("should handle circuit breaker states correctly", async () => {
    const circuitBreaker = new SimpleCircuitBreaker({
      failureThreshold: 2,
      recoveryTimeout: 1000,
      successThreshold: 1,
    });
    
    // Test successful execution
    const successResult = await circuitBreaker.execute(async () => "success");
    expect(successResult).toBe("success");
    expect(circuitBreaker.getState()).toBe("closed");
    
    // Test failure threshold
    let failureCount = 0;
    try {
      await circuitBreaker.execute(async () => {
        failureCount++;
        throw new Error("operation failed");
      });
    } catch (error) {
      // Expected to fail
    }
    
    try {
      await circuitBreaker.execute(async () => {
        failureCount++;
        throw new Error("operation failed");
      });
    } catch (error) {
      // Expected to fail
    }
    
    expect(failureCount).toBe(2);
    expect(circuitBreaker.getState()).toBe("open");
    
    // Test recovery
    circuitBreaker.forceClose();
    expect(circuitBreaker.getState()).toBe("closed");
  });

  it("should handle retry strategy correctly", async () => {
    const retryStrategy = new SimpleRetryStrategy({
      maxAttempts: 3,
      baseDelay: 10, // Short delay for testing
      maxDelay: 100,
      backoffMultiplier: 2,
      jitterFactor: 0,
    });
    
    let attemptCount = 0;
    const result = await retryStrategy.execute(async () => {
      attemptCount++;
      if (attemptCount < 3) {
        throw new Error("temporary failure");
      }
      return "success";
    });
    
    expect(result).toBe("success");
    expect(attemptCount).toBe(3);
  });

  it("should handle retry with non-retryable errors", async () => {
    const retryStrategy = new SimpleRetryStrategy({
      maxAttempts: 3,
      baseDelay: 10,
      maxDelay: 100,
      backoffMultiplier: 2,
      jitterFactor: 0,
      retryableErrors: ["temporary", "retryable"],
    });
    
    let attemptCount = 0;
    try {
      await retryStrategy.execute(async () => {
        attemptCount++;
        throw new Error("permanent failure");
      });
    } catch (error) {
      // Expected to fail
    }
    
    // Should not retry non-retryable errors
    expect(attemptCount).toBe(1);
  });
});
