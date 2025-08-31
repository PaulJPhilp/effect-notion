// Simple metrics implementation for basic monitoring
export interface SimpleMetrics {
  incrementCounter(name: string, value?: number): void;
  recordDuration(name: string, durationMs: number): void;
  setGauge(name: string, value: number): void;
  getMetrics(): Record<string, any>;
}

export class SimpleMetricsService implements SimpleMetrics {
  private counters: Map<string, number> = new Map();
  private durations: Map<string, number[]> = new Map();
  private gauges: Map<string, number> = new Map();

  incrementCounter(name: string, value: number = 1): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + value);
  }

  recordDuration(name: string, durationMs: number): void {
    if (!this.durations.has(name)) {
      this.durations.set(name, []);
    }
    this.durations.get(name)!.push(durationMs);
  }

  setGauge(name: string, value: number): void {
    this.gauges.set(name, value);
  }

  getMetrics(): Record<string, any> {
    const result: Record<string, any> = {};
    
    // Counters
    for (const [name, value] of this.counters) {
      result[`${name}_total`] = value;
    }
    
    // Durations (average)
    for (const [name, values] of this.durations) {
      if (values.length > 0) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        result[`${name}_avg_ms`] = Math.round(avg);
        result[`${name}_count`] = values.length;
      }
    }
    
    // Gauges
    for (const [name, value] of this.gauges) {
      result[name] = value;
    }
    
    return result;
  }

  // Reset all metrics (useful for testing)
  reset(): void {
    this.counters.clear();
    this.durations.clear();
    this.gauges.clear();
  }
}

// Global metrics instance
export const globalMetrics = new SimpleMetricsService();
