import type * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as HttpClientResponse from "@effect/platform/HttpClientResponse";
import { Cause, Effect } from "effect";
import type * as S from "effect/Schema";
import { globalMetrics } from "../../metrics/simple.js";
import { SimpleCircuitBreaker } from "../../resilience/simple.js";
import { SimpleRetryStrategy } from "../../resilience/simpleRetry.js";
import {
  BadRequestError,
  InternalServerError,
  InvalidApiKeyError,
  NotFoundError,
  RequestTimeoutError,
  type NotionError,
} from "./errors.js";

// Helper function to handle HTTP response status codes
function handleResponseStatus<T, I>(
  response: HttpClientResponse.HttpClientResponse,
  schema: S.Schema<T, I, never>
): Effect.Effect<T, NotionError> {
  if (response.status === 401) {
    return Effect.fail(new InvalidApiKeyError({ cause: undefined }));
  }
  if (response.status === 404) {
    return Effect.fail(new NotFoundError({ cause: undefined }));
  }
  if (response.status === 400 || response.status === 422) {
    return response.text.pipe(
      Effect.catchAll(() => Effect.succeed("")),
      Effect.tap((body) =>
        Effect.logWarning(`Notion BadRequest ${response.status}: ${body}`)
      ),
      Effect.flatMap((body) =>
        Effect.fail(
          new BadRequestError({ cause: `${response.status}:${body}` })
        )
      )
    );
  }
  if (response.status >= 400) {
    return response.text.pipe(
      Effect.catchAll(() => Effect.succeed("")),
      Effect.tap((body) =>
        Effect.logWarning(`Notion Error ${response.status}: ${body}`)
      ),
      Effect.flatMap((body) =>
        Effect.fail(
          new InternalServerError({ cause: `${response.status}:${body}` })
        )
      )
    );
  }
  return HttpClientResponse.schemaBodyJson(schema)(response).pipe(
    Effect.mapError((cause) => new InternalServerError({ cause }))
  );
}

// Helper function to handle unit response status codes
function handleUnitResponseStatus(
  response: HttpClientResponse.HttpClientResponse
): Effect.Effect<void, NotionError> {
  if (response.status === 401) {
    return Effect.fail(new InvalidApiKeyError({ cause: undefined }));
  }
  if (response.status === 404) {
    return Effect.fail(new NotFoundError({ cause: undefined }));
  }
  if (response.status === 400 || response.status === 422) {
    return response.text.pipe(
      Effect.catchAll(() => Effect.succeed("")),
      Effect.tap((body) =>
        Effect.logWarning(`Notion BadRequest ${response.status}: ${body}`)
      ),
      Effect.flatMap((body) =>
        Effect.fail(new BadRequestError({ cause: body }))
      )
    );
  }
  if (response.status >= 400) {
    return response.text.pipe(
      Effect.catchAll(() => Effect.succeed("")),
      Effect.tap((body) =>
        Effect.logWarning(`Notion Error ${response.status}: ${body}`)
      ),
      Effect.flatMap((body) =>
        Effect.fail(new InternalServerError({ cause: body }))
      )
    );
  }
  return Effect.succeed(undefined);
}

// Global instances for resilience and metrics
const notionCircuitBreaker = new SimpleCircuitBreaker({
  failureThreshold: 5,
  recoveryTimeout: 30000, // 30 seconds
  successThreshold: 3,
});

const notionRetryStrategy = new SimpleRetryStrategy({
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  retryableErrors: ["timeout", "network", "service_unavailable"],
});

export const withNotionHeaders = (apiKey: string) =>
  HttpClientRequest.setHeaders({
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  });

export const createPerformRequest =
  (client: HttpClient.HttpClient) =>
  <A, I>(
    request: HttpClientRequest.HttpClientRequest,
    schema: S.Schema<A, I, never>,
    timeoutMs = 10_000,
    operation = "unknown"
  ): Effect.Effect<A, NotionError> =>
    Effect.gen(function* () {
      const startTime = Date.now();

      // Increment request counter
      globalMetrics.incrementCounter("notion_api_requests_total", 1);
      globalMetrics.incrementCounter(
        `notion_api_requests_${operation}_total`,
        1
      );

      try {
        // Execute with circuit breaker and retry strategy
        const result: A = yield* Effect.promise(() =>
          notionCircuitBreaker.execute(async () =>
            notionRetryStrategy.execute(async () => {
              // Convert Effect to Promise for the resilience layer
              const response = await Effect.runPromise(
                client.execute(request).pipe(
                  Effect.timeout(timeoutMs),
                  Effect.mapError((cause) => {
                    // Check if it's a timeout error and convert to our custom timeout error
                    if (Cause.isTimeoutException(cause)) {
                      return new RequestTimeoutError({ timeoutMs });
                    }
                    return new InternalServerError({ cause });
                  }),
                  Effect.flatMap((response) =>
                    handleResponseStatus(response, schema)
                  )
                )
              );
              return response;
            })
          )
        );

        // Record successful API call
        const duration = Date.now() - startTime;
        globalMetrics.recordDuration("notion_api_duration_ms", duration);
        globalMetrics.recordDuration(
          `notion_api_${operation}_duration_ms`,
          duration
        );
        globalMetrics.incrementCounter("notion_api_success_total", 1);
        globalMetrics.incrementCounter(
          `notion_api_${operation}_success_total`,
          1
        );

        // Update circuit breaker state
        globalMetrics.setGauge(
          "notion_circuit_breaker_state",
          notionCircuitBreaker.getState() === "closed" ? 1 : 0
        );

        return result;
      } catch (error) {
        // Record failed API call
        const duration = Date.now() - startTime;
        const errorType =
          error instanceof Error ? error.constructor.name : "UnknownError";

        globalMetrics.recordDuration("notion_api_error_duration_ms", duration);
        globalMetrics.recordDuration(
          `notion_api_${operation}_error_duration_ms`,
          duration
        );
        globalMetrics.incrementCounter("notion_api_errors_total", 1);
        globalMetrics.incrementCounter(
          `notion_api_${operation}_errors_total`,
          1
        );
        globalMetrics.incrementCounter(
          `notion_api_errors_${errorType}_total`,
          1
        );

        // Update circuit breaker state
        globalMetrics.setGauge(
          "notion_circuit_breaker_state",
          notionCircuitBreaker.getState() === "closed" ? 1 : 0
        );

        throw error;
      }
    });

export const createPerformRequestUnit =
  (client: HttpClient.HttpClient) =>
  (
    request: HttpClientRequest.HttpClientRequest,
    timeoutMs = 10_000,
    operation = "unknown"
  ): Effect.Effect<void, NotionError> =>
    Effect.gen(function* () {
      const startTime = Date.now();

      // Increment request counter
      globalMetrics.incrementCounter("notion_api_requests_total", 1);
      globalMetrics.incrementCounter(
        `notion_api_requests_${operation}_total`,
        1
      );

      try {
        // Execute with circuit breaker and retry strategy
        yield* Effect.promise(() =>
          notionCircuitBreaker.execute(async () =>
            notionRetryStrategy.execute(async () => {
              // Convert Effect to Promise for the resilience layer
              const response = await Effect.runPromise(
                client.execute(request).pipe(
                  Effect.timeout(timeoutMs),
                  Effect.mapError((cause) => {
                    // Check if it's a timeout error and convert to our custom timeout error
                    if (Cause.isTimeoutException(cause)) {
                      return new RequestTimeoutError({ timeoutMs });
                    }
                    return new InternalServerError({ cause });
                  }),
                  Effect.flatMap((response) =>
                    handleUnitResponseStatus(response)
                  )
                )
              );
              return response;
            })
          )
        );

        // Record successful API call
        const duration = Date.now() - startTime;
        globalMetrics.recordDuration("notion_api_duration_ms", duration);
        globalMetrics.recordDuration(
          `notion_api_${operation}_duration_ms`,
          duration
        );
        globalMetrics.incrementCounter("notion_api_success_total", 1);
        globalMetrics.incrementCounter(
          `notion_api_${operation}_success_total`,
          1
        );

        // Update circuit breaker state
        globalMetrics.setGauge(
          "notion_circuit_breaker_state",
          notionCircuitBreaker.getState() === "closed" ? 1 : 0
        );

        return undefined;
      } catch (error) {
        // Record failed API call
        const duration = Date.now() - startTime;
        const errorType =
          error instanceof Error ? error.constructor.name : "UnknownError";

        globalMetrics.recordDuration("notion_api_error_duration_ms", duration);
        globalMetrics.recordDuration(
          `notion_api_${operation}_error_duration_ms`,
          duration
        );
        globalMetrics.incrementCounter("notion_api_errors_total", 1);
        globalMetrics.incrementCounter(
          `notion_api_${operation}_errors_total`,
          1
        );
        globalMetrics.incrementCounter(
          `notion_api_errors_${errorType}_total`,
          1
        );

        // Update circuit breaker state
        globalMetrics.setGauge(
          "notion_circuit_breaker_state",
          notionCircuitBreaker.getState() === "closed" ? 1 : 0
        );

        throw error;
      }
    });

// Test-only helper mirroring status mapping
export const __test__mapStatusToError = (
  status: number,
  body: string
): NotionError | undefined => {
  if (status === 401) {
    return new InvalidApiKeyError({ cause: undefined });
  }
  if (status === 404) {
    return new NotFoundError({ cause: undefined });
  }
  if (status === 400 || status === 422) {
    return new BadRequestError({ cause: body });
  }
  if (status >= 400) {
    return new InternalServerError({ cause: body });
  }
  return undefined;
};
