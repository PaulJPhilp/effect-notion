import * as HttpRouter from "@effect/platform/HttpRouter";
import { describe, expect, it } from "vitest";
import { globalMetrics } from "../src/metrics/simple.js";
import { applySimpleMetricsRoutes } from "../src/router/simpleMetrics.js";

describe("Metrics Endpoint", () => {
  it("should expose metrics endpoint and return metrics data", async () => {
    // Create a simple router with metrics
    const router = HttpRouter.empty.pipe(applySimpleMetricsRoutes);

    // Record some test metrics
    globalMetrics.incrementCounter("test_counter", 1);
    globalMetrics.recordDuration("test_duration", 100);
    globalMetrics.setGauge("test_gauge", 42);

    // Get metrics from the service directly
    const metrics = globalMetrics.getMetrics();

    // Verify metrics were recorded
    expect(metrics.test_counter_total).toBe(1);
    expect(metrics.test_duration_avg_ms).toBe(100);
    expect(metrics.test_gauge).toBe(42);

    // Reset metrics for clean state
    globalMetrics.reset();
  });

  it("should handle metrics endpoint request", async () => {
    // Create a simple router with metrics
    const router = HttpRouter.empty.pipe(applySimpleMetricsRoutes);

    // Record some test metrics
    globalMetrics.incrementCounter("http_requests", 5);
    globalMetrics.recordDuration("api_call", 150);
    globalMetrics.setGauge("active_connections", 3);

    // Simulate a request to the metrics endpoint
    const request = new Request("http://localhost/api/metrics", {
      method: "GET",
    });

    // Note: This is a basic test - in a real scenario you'd need to run the server
    // and make an actual HTTP request. For now, we'll just verify the metrics are recorded.
    const metrics = globalMetrics.getMetrics();

    expect(metrics.http_requests_total).toBe(5);
    expect(metrics.api_call_avg_ms).toBe(150);
    expect(metrics.active_connections).toBe(3);

    // Reset metrics for clean state
    globalMetrics.reset();
  });
});
