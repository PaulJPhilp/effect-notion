import type * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as HttpClientResponse from "@effect/platform/HttpClientResponse";
import {
  Cause,
  Clock,
  Effect,
  Metric,
  MetricBoundaries,
  Schedule,
} from "effect";
import type * as S from "effect/Schema";
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

/**
 * Effect-native metrics for Notion API requests.
 * 
 * These metrics are fiber-safe and integrate with Effect's
 * metric system for proper observability.
 */
const notionRequestCounter = Metric.counter("notion_api_requests_total");
const notionSuccessCounter = Metric.counter("notion_api_success_total");
const notionErrorCounter = Metric.counter("notion_api_errors_total");
const notionDurationHistogram = Metric.histogram(
  "notion_api_duration_ms",
  MetricBoundaries.exponential({ start: 10, factor: 2, count: 10 })
);

/**
 * Retry schedule for Notion API requests.
 * 
 * Uses exponential backoff with jitter to prevent thundering herd.
 * Configuration: 3 total attempts (1 initial + 2 retries)
 * - Base delay: 1 second
 * - Fallback: 500ms spacing
 * - Jitter: randomized to spread load
 */
const notionRetrySchedule = Schedule.exponential("1 second").pipe(
  Schedule.either(Schedule.spaced("500 millis")),
  Schedule.compose(Schedule.recurs(2)), // 2 retries = 3 total attempts
  Schedule.jittered
);

/**
 * Determines if a Notion API error should trigger a retry.
 * 
 * Retryable errors:
 * - RequestTimeoutError: Network timeouts
 * - InternalServerError: 5xx responses from Notion
 * 
 * Non-retryable errors (fail fast):
 * - InvalidApiKeyError: 401 authentication failures
 * - NotFoundError: 404 resource not found
 * - BadRequestError: 400/422 validation errors
 */
const isRetryableError = (error: NotionError): boolean => {
  return (
    error._tag === "RequestTimeoutError" ||
    error._tag === "InternalServerError"
  );
};

/**
 * Adds required Notion API headers to an HTTP request.
 * 
 * @param apiKey - Notion integration API key
 * @returns Request transformer that adds authentication and version headers
 */
export const withNotionHeaders = (apiKey: string) =>
  HttpClientRequest.setHeaders({
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  });

/**
 * Creates a function to perform Notion API requests with Effect-native
 * retry, timeout, and metrics.
 * 
 * Features:
 * - Automatic retry with exponential backoff for transient failures
 * - Configurable timeout with proper cancellation
 * - Fiber-safe metrics collection
 * - Type-safe response parsing with Schema validation
 * - Deterministic time tracking using Clock service
 * 
 * @param client - Effect HTTP client instance
 * @returns Request executor function
 */
export const createPerformRequest =
  (client: HttpClient.HttpClient) =>
  <A, I>(
    request: HttpClientRequest.HttpClientRequest,
    schema: S.Schema<A, I, never>,
    timeoutMs = 10_000,
    _operation = "unknown"
  ): Effect.Effect<A, NotionError> =>
    Effect.gen(function* () {
      const startTime = yield* Clock.currentTimeMillis;

      // Increment request counter
      yield* Metric.increment(notionRequestCounter);

      // Core request effect with timeout and error handling
      const requestEffect = client.execute(request).pipe(
        Effect.timeout(timeoutMs),
        Effect.mapError((cause) => {
          if (Cause.isTimeoutException(cause)) {
            return new RequestTimeoutError({ timeoutMs });
          }
          return new InternalServerError({ cause });
        }),
        Effect.flatMap((response) => handleResponseStatus(response, schema))
      );

      // Apply retry policy for retryable errors
      const result = yield* requestEffect.pipe(
        Effect.retry({
          schedule: notionRetrySchedule,
          while: isRetryableError,
        }),
        Effect.tapError((error) =>
          Effect.gen(function* () {
            yield* Metric.increment(notionErrorCounter);
            yield* Effect.logWarning(
              `Notion API request failed: ${error._tag}`
            );
          })
        ),
        Effect.tap(() =>
          Effect.gen(function* () {
            const endTime = yield* Clock.currentTimeMillis;
            const duration = endTime - startTime;
            yield* Metric.increment(notionSuccessCounter);
            yield* Metric.update(notionDurationHistogram, duration);
          })
        )
      );

      return result;
    });

export const createPerformRequestUnit =
  (client: HttpClient.HttpClient) =>
  (
    request: HttpClientRequest.HttpClientRequest,
    timeoutMs = 10_000,
    _operation = "unknown"
  ): Effect.Effect<void, NotionError> =>
    Effect.gen(function* () {
      const startTime = yield* Clock.currentTimeMillis;

      // Increment request counter
      yield* Metric.increment(notionRequestCounter);

      // Core request effect with timeout and error handling
      const requestEffect = client.execute(request).pipe(
        Effect.timeout(timeoutMs),
        Effect.mapError((cause) => {
          if (Cause.isTimeoutException(cause)) {
            return new RequestTimeoutError({ timeoutMs });
          }
          return new InternalServerError({ cause });
        }),
        Effect.flatMap((response) => handleUnitResponseStatus(response))
      );

      // Apply retry policy for retryable errors
      yield* requestEffect.pipe(
        Effect.retry({
          schedule: notionRetrySchedule,
          while: isRetryableError,
        }),
        Effect.tapError((error) =>
          Effect.gen(function* () {
            yield* Metric.increment(notionErrorCounter);
            yield* Effect.logWarning(
              `Notion API request failed: ${error._tag}`
            );
          })
        ),
        Effect.tap(() =>
          Effect.gen(function* () {
            const endTime = yield* Clock.currentTimeMillis;
            const duration = endTime - startTime;
            yield* Metric.increment(notionSuccessCounter);
            yield* Metric.update(notionDurationHistogram, duration);
          })
        )
      );
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
