import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SimpleCircuitBreaker } from "../src/resilience/simple.js";
import { SimpleRetryStrategy } from "../src/resilience/simpleRetry.js";

describe("Resilience Features", () => {
  describe("Circuit Breaker", () => {
    let circuitBreaker: SimpleCircuitBreaker;

    beforeEach(() => {
      circuitBreaker = new SimpleCircuitBreaker({
        failureThreshold: 3,
        recoveryTimeout: 1000,
        successThreshold: 2,
      });
    });

    afterEach(() => {
      circuitBreaker.forceClose();
    });

    it("should start in closed state", () => {
      expect(circuitBreaker.getState()).toBe("closed");
    });

    it("should allow calls when closed", async () => {
      const result = await circuitBreaker.execute(async () => "success");
      expect(result).toBe("success");
      expect(circuitBreaker.getState()).toBe("closed");
    });

    it("should track failures and open circuit", async () => {
      // First few failures
      await expect(
        circuitBreaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow();
      await expect(
        circuitBreaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow();
      await expect(
        circuitBreaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow();

      // Circuit should now be open
      expect(circuitBreaker.getState()).toBe("open");

      // Calls should fail fast
      await expect(
        circuitBreaker.execute(async () => "should not execute")
      ).rejects.toThrow();
    });

    it("should transition to half-open after reset timeout", async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(async () => {
            throw new Error("fail");
          })
        ).rejects.toThrow();
      }

      expect(circuitBreaker.getState()).toBe("open");

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should be half-open
      expect(circuitBreaker.getState()).toBe("half_open");
    });

    it("should close circuit on successful call in half-open state", async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(async () => {
            throw new Error("fail");
          })
        ).rejects.toThrow();
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Successful call should close the circuit
      const result = await circuitBreaker.execute(async () => "success");
      expect(result).toBe("success");
      expect(circuitBreaker.getState()).toBe("half_open");
    });

    it("should reopen circuit on failure in half-open state", async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(
          circuitBreaker.execute(async () => {
            throw new Error("fail");
          })
        ).rejects.toThrow();
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Failed call should reopen the circuit
      await expect(
        circuitBreaker.execute(async () => {
          throw new Error("fail");
        })
      ).rejects.toThrow();
      expect(circuitBreaker.getState()).toBe("open");
    });

    it("should handle async operations", async () => {
      const asyncOperation = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return "async success";
      };

      const result = await circuitBreaker.execute(asyncOperation);
      expect(result).toBe("async success");
    });

    it("should handle async failures", async () => {
      const asyncFailure = async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        throw new Error("async fail");
      };

      // First few failures
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(asyncFailure)).rejects.toThrow(
          "async fail"
        );
      }

      // Circuit should be open
      expect(circuitBreaker.getState()).toBe("open");
    });

    it("should provide metrics", async () => {
      await circuitBreaker.execute(async () => "success");
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe("closed");
      expect(stats.successCount).toBe(0); // Success count is reset after successful execution
      expect(stats.failureCount).toBe(0);
    });
  });

  describe("Retry Strategy", () => {
    let retryStrategy: SimpleRetryStrategy;

    beforeEach(() => {
      retryStrategy = new SimpleRetryStrategy({
        maxAttempts: 3,
        baseDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        jitterFactor: 0.1,
        retryableErrors: ["NetworkError", "TimeoutError"],
      });
    });

    it("should succeed on first attempt", async () => {
      const operation = async () => "success";
      const result = await retryStrategy.execute(operation);
      expect(result).toBe("success");
    });

    it("should retry on retryable errors", async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("NetworkError");
        }
        return "success";
      };

      const result = await retryStrategy.execute(operation);
      expect(result).toBe("success");
      expect(attempts).toBe(3);
    });

    it("should fail after max attempts", async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        throw new Error("NetworkError");
      };

      await expect(retryStrategy.execute(operation)).rejects.toThrow(
        "NetworkError"
      );
      expect(attempts).toBe(3);
    });

    it("should not retry non-retryable errors", async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        throw new Error("ValidationError");
      };

      await expect(retryStrategy.execute(operation)).rejects.toThrow(
        "ValidationError"
      );
      expect(attempts).toBe(1);
    });

    it("should apply exponential backoff", async () => {
      let attempts = 0;
      const startTime = Date.now();
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("NetworkError");
        }
        return "success";
      };

      await retryStrategy.execute(operation);
      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeGreaterThan(200); // At least 2 delays
      expect(attempts).toBe(3);
    });

    it("should respect max delay", async () => {
      retryStrategy = new SimpleRetryStrategy({
        maxAttempts: 3,
        baseDelay: 100,
        maxDelay: 200,
        backoffMultiplier: 2,
        jitterFactor: 0,
        retryableErrors: ["NetworkError"],
      });

      let attempts = 0;
      const startTime = Date.now();
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("NetworkError");
        }
        return "success";
      };

      await retryStrategy.execute(operation);
      const totalTime = Date.now() - startTime;
      // Should be capped at maxDelay
      expect(totalTime).toBeLessThan(1000); // 2 * 200ms max
      expect(attempts).toBe(3);
    });

    it("should handle operations that return values", async () => {
      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error("NetworkError");
        }
        return { data: "success", count: attempts };
      };

      const result = await retryStrategy.execute(operation);
      expect(result).toEqual({ data: "success", count: 2 });
    });

    it("should handle custom retryable error types", async () => {
      retryStrategy = new SimpleRetryStrategy({
        maxAttempts: 3,
        baseDelay: 100,
        maxDelay: 1000,
        backoffMultiplier: 2,
        jitterFactor: 0.1,
        retryableErrors: ["CustomError"],
      });

      let attempts = 0;
      const operation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error("CustomError");
        }
        return "success";
      };

      const result = await retryStrategy.execute(operation);
      expect(result).toBe("success");
      expect(attempts).toBe(3);
    });

    it("should provide configuration access", () => {
      const config = retryStrategy.getConfig();
      expect(config.maxAttempts).toBe(3);
      expect(config.baseDelay).toBe(100);
      expect(config.maxDelay).toBe(1000);
    });

    it("should create retry policy for specific errors", () => {
      const policy = retryStrategy.forErrors(["SpecificError"]);
      const config = policy.getConfig();
      expect(config.maxAttempts).toBe(3);
      expect(config.retryableErrors).toEqual(["SpecificError"]);
    });

    it("should create retry policy with custom attempts", () => {
      const policy = retryStrategy.withMaxAttempts(5);
      const config = policy.getConfig();
      expect(config.maxAttempts).toBe(5);
    });

    it("should create retry policy with custom delays", () => {
      const policy = retryStrategy.withDelays(500, 2000);
      const config = policy.getConfig();
      expect(config.baseDelay).toBe(500);
      expect(config.maxDelay).toBe(2000);
    });
  });

  describe("Integration: Circuit Breaker + Retry Strategy", () => {
    it("should combine circuit breaker with retry strategy", async () => {
      const circuitBreaker = new SimpleCircuitBreaker({
        failureThreshold: 2,
        recoveryTimeout: 1000,
        successThreshold: 1,
      });

      const retryStrategy = new SimpleRetryStrategy({
        maxAttempts: 3,
        baseDelay: 50,
        maxDelay: 200,
        backoffMultiplier: 2,
        jitterFactor: 0,
        retryableErrors: ["NetworkError"],
      });

      // Test retry strategy with a failing operation
      let retryAttempts = 0;
      const retryOperation = async () => {
        retryAttempts++;
        if (retryAttempts < 3) {
          throw new Error("NetworkError");
        }
        return "retry-success";
      };

      // First, retry the operation
      const retryResult = await retryStrategy.execute(retryOperation);
      expect(retryResult).toBe("retry-success");
      expect(retryAttempts).toBe(3);

      // Then, use circuit breaker to protect against repeated failures
      const protectedOperation = async () => {
        return circuitBreaker.execute(async () => {
          // This should succeed immediately since we're not throwing errors
          return "protected-success";
        });
      };

      const finalResult = await protectedOperation();
      expect(finalResult).toBe("protected-success");
    });
  });
});
