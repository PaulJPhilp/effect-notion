#!/usr/bin/env bun

/**
 * Demonstration of Metrics and Resilience Features
 *
 * This script demonstrates:
 * 1. Simple metrics collection (counters, durations, gauges)
 * 2. Circuit breaker pattern for fault tolerance
 * 3. Retry strategy with exponential backoff
 * 4. Integration with the NotionClient helpers
 */

import { globalMetrics } from "../src/metrics/simple.js";
import { SimpleCircuitBreaker } from "../src/resilience/simple.js";
import { SimpleRetryStrategy } from "../src/resilience/simpleRetry.js";

// Create instances for demonstration
const circuitBreaker = new SimpleCircuitBreaker({
  failureThreshold: 3,
  recoveryTimeout: 5000, // 5 seconds for demo
  successThreshold: 2,
});

const retryStrategy = new SimpleRetryStrategy({
  maxAttempts: 3,
  baseDelay: 100, // 100ms for demo
  maxDelay: 1000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
});

// Simulate some API operations
async function simulateApiCall(
  operation: string,
  shouldFail = false
): Promise<string> {
  const startTime = Date.now();

  // Record request
  globalMetrics.incrementCounter(`api_requests_${operation}_total`, 1);

  try {
    // Simulate API call with random delay
    const delay = Math.random() * 100 + 50; // 50-150ms
    await new Promise((resolve) => setTimeout(resolve, delay));

    if (shouldFail) {
      throw new Error(`Simulated failure for ${operation}`);
    }

    // Record success
    const duration = Date.now() - startTime;
    globalMetrics.recordDuration(`api_duration_${operation}_ms`, duration);
    globalMetrics.incrementCounter(`api_success_${operation}_total`, 1);

    return `Success: ${operation} completed in ${duration}ms`;
  } catch (error) {
    // Record failure
    const duration = Date.now() - startTime;
    globalMetrics.recordDuration(
      `api_error_duration_${operation}_ms`,
      duration
    );
    globalMetrics.incrementCounter(`api_errors_${operation}_total`, 1);

    throw error;
  }
}

// Demonstrate circuit breaker
async function demonstrateCircuitBreaker() {
  console.log("\n=== Circuit Breaker Demonstration ===");

  // Simulate successful operations
  for (let i = 0; i < 2; i++) {
    try {
      const result = await circuitBreaker.execute(() =>
        simulateApiCall("circuit_breaker", false)
      );
      console.log(`✓ ${result}`);
    } catch (error) {
      console.log(`✗ ${error.message}`);
    }
  }

  console.log(`Circuit Breaker State: ${circuitBreaker.getState()}`);

  // Simulate failures to trigger circuit breaker
  for (let i = 0; i < 4; i++) {
    try {
      await circuitBreaker.execute(() =>
        simulateApiCall("circuit_breaker", true)
      );
    } catch (error) {
      console.log(`✗ Failure ${i + 1}: ${error.message}`);
    }
  }

  console.log(`Circuit Breaker State: ${circuitBreaker.getState()}`);

  // Wait for recovery
  console.log("Waiting for circuit breaker recovery...");
  await new Promise((resolve) => setTimeout(resolve, 6000));

  // Try again after recovery
  try {
    const result = await circuitBreaker.execute(() =>
      simulateApiCall("circuit_breaker", false)
    );
    console.log(`✓ Recovery: ${result}`);
  } catch (error) {
    console.log(`✗ Recovery failed: ${error.message}`);
  }

  console.log(`Final Circuit Breaker State: ${circuitBreaker.getState()}`);
}

// Demonstrate retry strategy
async function demonstrateRetryStrategy() {
  console.log("\n=== Retry Strategy Demonstration ===");

  // Simulate operation that fails initially but succeeds on retry
  let attemptCount = 0;
  const operation = async () => {
    attemptCount++;
    if (attemptCount < 3) {
      throw new Error(`Temporary failure on attempt ${attemptCount}`);
    }
    return "Operation succeeded after retries";
  };

  try {
    const result = await retryStrategy.execute(operation);
    console.log(`✓ ${result}`);
    console.log(`Total attempts: ${attemptCount}`);
  } catch (error) {
    console.log(`✗ All retries failed: ${error.message}`);
  }
}

// Demonstrate metrics collection
function demonstrateMetrics() {
  console.log("\n=== Metrics Collection Demonstration ===");

  // Record some additional metrics
  globalMetrics.setGauge("active_connections", 15);
  globalMetrics.setGauge("memory_usage_mb", 128);

  // Display all collected metrics
  const metrics = globalMetrics.getMetrics();
  console.log("Collected Metrics:");

  Object.entries(metrics).forEach(([name, value]) => {
    console.log(`  ${name}: ${value}`);
  });

  // Show circuit breaker stats
  const stats = circuitBreaker.getStats();
  console.log("\nCircuit Breaker Stats:");
  console.log(`  State: ${stats.state}`);
  console.log(`  Failure Count: ${stats.failureCount}`);
  console.log(`  Success Count: ${stats.successCount}`);
  console.log(
    `  Last Failure Time: ${
      stats.lastFailureTime
        ? new Date(stats.lastFailureTime).toISOString()
        : "None"
    }`
  );
}

// Main demonstration
async function main() {
  console.log("🚀 Metrics and Resilience Features Demonstration");
  console.log("=".repeat(50));

  try {
    await demonstrateCircuitBreaker();
    await demonstrateRetryStrategy();
    demonstrateMetrics();

    console.log("\n✅ Demonstration completed successfully!");
    console.log("\nTo view metrics in your application:");
    console.log("1. Start your server: bun start");
    console.log("2. Visit: http://localhost:3000/api/metrics");
    console.log("3. Or check the metrics endpoint in your Vercel deployment");
  } catch (error) {
    console.error("❌ Demonstration failed:", error);
  }
}

// Run the demonstration
if (import.meta.main) {
  main().catch(console.error);
}
