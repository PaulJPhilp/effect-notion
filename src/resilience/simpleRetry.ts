// Simple retry strategy implementation
export interface RetryConfig {
  readonly maxAttempts: number;
  readonly baseDelay: number;
  readonly maxDelay: number;
  readonly backoffMultiplier: number;
  readonly jitterFactor: number;
  readonly retryableErrors?: Array<string>;
}

export const DefaultRetryConfig: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2,
  jitterFactor: 0.1, // 10% jitter
} as const;

export class SimpleRetryStrategy {
  constructor(
    private readonly config: RetryConfig = DefaultRetryConfig
  ) {}

  private isRetryableError(error: unknown): boolean {
    if (!this.config.retryableErrors) return true;
    
    const errorMessage = error instanceof Error ? error.message : String(error);
    return this.config.retryableErrors.some(retryable => 
      errorMessage.includes(retryable)
    );
  }

  private calculateDelay(attempt: number): number {
    const exponentialDelay = this.config.baseDelay * 
      Math.pow(this.config.backoffMultiplier, attempt - 1);
    
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = cappedDelay * this.config.jitterFactor * Math.random();
    const finalDelay = cappedDelay + jitter;
    
    return Math.floor(finalDelay);
  }

  async execute<T>(
    operation: () => Promise<T>
  ): Promise<T> {
    let lastError: unknown = null;
    
    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        return result;
      } catch (error) {
        lastError = error;
        
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        if (attempt < this.config.maxAttempts) {
          const delay = this.calculateDelay(attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // If we get here, all attempts failed
    throw lastError || new Error("All retry attempts failed");
  }

  // Create a retry policy for specific error types
  forErrors(errorTypes: Array<string>): SimpleRetryStrategy {
    return new SimpleRetryStrategy({
      ...this.config,
      retryableErrors: errorTypes,
    });
  }

  // Create a retry policy with custom attempt count
  withMaxAttempts(maxAttempts: number): SimpleRetryStrategy {
    return new SimpleRetryStrategy({
      ...this.config,
      maxAttempts,
    });
  }

  // Create a retry policy with custom delays
  withDelays(baseDelay: number, maxDelay: number): SimpleRetryStrategy {
    return new SimpleRetryStrategy({
      ...this.config,
      baseDelay,
      maxDelay,
    });
  }

  // Get current configuration
  getConfig(): RetryConfig {
    return { ...this.config };
  }
}
