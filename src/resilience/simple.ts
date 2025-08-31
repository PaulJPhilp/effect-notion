// Simple circuit breaker implementation
export type CircuitBreakerState = "closed" | "open" | "half_open";

export interface CircuitBreakerConfig {
  readonly failureThreshold: number;
  readonly recoveryTimeout: number;
  readonly successThreshold: number;
}

export const DefaultCircuitBreakerConfig: CircuitBreakerConfig = {
  failureThreshold: 5,
  recoveryTimeout: 30000, // 30 seconds
  successThreshold: 3,
} as const;

export class SimpleCircuitBreaker {
  private state: CircuitBreakerState = "closed";
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private recoveryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: CircuitBreakerConfig = DefaultCircuitBreakerConfig
  ) {}

  getState(): CircuitBreakerState {
    return this.state;
  }

  private setState(newState: CircuitBreakerState): void {
    this.state = newState;
  }

  private incrementFailureCount(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
  }

  private incrementSuccessCount(): void {
    this.successCount++;
  }

  private resetCounts(): void {
    this.failureCount = 0;
    this.successCount = 0;
  }

  private shouldOpen(): boolean {
    return this.failureCount >= this.config.failureThreshold;
  }

  private shouldClose(): boolean {
    return this.successCount >= this.config.successThreshold;
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    return timeSinceLastFailure >= this.config.recoveryTimeout;
  }

  async execute<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    const currentState = this.getState();
    
    switch (currentState) {
      case "closed":
        return this.executeInClosedState(operation);
      
      case "open":
        return this.executeInOpenState(operation);
      
      case "half_open":
        return this.executeInHalfOpenState(operation);
    }
  }

  private async executeInClosedState<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    try {
      const result = await operation();
      this.resetCounts();
      return result;
    } catch (error) {
      this.incrementFailureCount();
      
      if (this.shouldOpen()) {
        this.setState("open");
        this.scheduleRecovery();
      }
      
      throw error;
    }
  }

  private async executeInOpenState<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    if (this.shouldAttemptReset()) {
      this.setState("half_open");
      return this.executeInHalfOpenState(operation);
    }
    
    throw new Error("Circuit breaker is open");
  }

  private async executeInHalfOpenState<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    try {
      const result = await operation();
      this.incrementSuccessCount();
      
      if (this.shouldClose()) {
        this.setState("closed");
        this.resetCounts();
      }
      
      return result;
    } catch (error) {
      this.incrementFailureCount();
      this.setState("open");
      this.scheduleRecovery();
      throw error;
    }
  }

  private scheduleRecovery(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
    }
    
    this.recoveryTimer = setTimeout(() => {
      this.setState("half_open");
    }, this.config.recoveryTimeout);
  }

  // Force open the circuit breaker (useful for manual control)
  forceOpen(): void {
    this.setState("open");
  }

  // Force close the circuit breaker (useful for manual control)
  forceClose(): void {
    this.setState("closed");
    this.resetCounts();
  }

  // Get current statistics
  getStats(): {
    state: CircuitBreakerState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number | null;
  } {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }

  // Cleanup
  destroy(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }
}
