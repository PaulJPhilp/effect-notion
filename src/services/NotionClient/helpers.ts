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
  ConflictError,
  ForbiddenError,
  InternalServerError,
  InvalidApiKeyError,
  NotFoundError,
  RateLimitedError,
  RequestTimeoutError,
  ServiceUnavailableError,
  type NotionError,
} from "./errors.js";

// Helper function to handle HTTP response status codes
function parseRetryAfterSeconds(
  response: HttpClientResponse.HttpClientResponse
): number | undefined {
  const headersAny = response.headers as unknown;
  let retryAfter: string | undefined;

  if (
    typeof Headers !== "undefined" &&
    headersAny instanceof Headers
  ) {
    const value = headersAny.get("retry-after");
    retryAfter = value === null ? undefined : value;
  } else if (headersAny && typeof headersAny === "object") {
    const maybeGet = (headersAny as { get?: (name: string) => string | null }).get;
    if (typeof maybeGet === "function") {
      const value = maybeGet.call(headersAny, "retry-after");
      retryAfter = value === null ? undefined : value;
    } else if ("retry-after" in (headersAny as Record<string, unknown>)) {
      const raw = (headersAny as Record<string, unknown>)["retry-after"];
      if (typeof raw === "string") {
        retryAfter = raw;
      }
    }
  }

  if (!retryAfter) {
    return undefined;
  }

  const parsed = Number(retryAfter);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }

  const date = Date.parse(retryAfter);
  if (!Number.isNaN(date)) {
    const diffMs = date - Date.now();
    if (diffMs > 0) {
      return Math.ceil(diffMs / 1000);
    }
  }

  return undefined;
}

const readBody = (
  response: HttpClientResponse.HttpClientResponse
): Effect.Effect<string, never> =>
  response.text.pipe(Effect.catchAll(() => Effect.succeed("")));

const failWithBody = <E extends NotionError>(
  response: HttpClientResponse.HttpClientResponse,
  create: (body: string) => E
): Effect.Effect<never, E> =>
  readBody(response).pipe(Effect.flatMap((body) => Effect.fail(create(body))));

function handleResponseStatus<T, I>(
  response: HttpClientResponse.HttpClientResponse,
  schema: S.Schema<T, I, never>
): Effect.Effect<T, NotionError> {
  const retryAfterSeconds = parseRetryAfterSeconds(response);

  switch (response.status) {
    case 400:
    case 422:
      return readBody(response).pipe(
        Effect.tap((body) =>
          Effect.logWarning(`Notion BadRequest ${response.status}: ${body}`)
        ),
        Effect.flatMap((body) =>
          Effect.fail(
            new BadRequestError({ cause: `${response.status}:${body}` })
          )
        )
      );
    case 401:
      return Effect.fail(new InvalidApiKeyError({ cause: undefined }));
    case 403:
      return failWithBody(
        response,
        (body) => new ForbiddenError({ cause: body || undefined })
      );
    case 404:
      return Effect.fail(new NotFoundError({ cause: undefined }));
    case 409:
      return failWithBody(
        response,
        (body) => new ConflictError({ cause: body || undefined })
      );
    case 429:
      return failWithBody(response, (body) =>
        new RateLimitedError({
          ...(body.length > 0 ? { cause: body } : {}),
          ...(retryAfterSeconds !== undefined
            ? { retryAfterSeconds }
            : {}),
        })
      );
    case 503:
      return failWithBody(
        response,
        (body) => new ServiceUnavailableError({ cause: body || undefined })
      );
    default:
      if (response.status >= 500) {
        return failWithBody(
          response,
          (body) =>
            new InternalServerError({
              cause: `${response.status}:${body}`,
            })
        );
      }
      if (response.status >= 400) {
        return failWithBody(
          response,
          (body) =>
            new InternalServerError({
              cause: `${response.status}:${body}`,
            })
        );
      }
      return HttpClientResponse.schemaBodyJson(schema)(response).pipe(
        Effect.mapError((cause) => new InternalServerError({ cause }))
      );
  }
}

// Helper function to handle unit response status codes
function handleUnitResponseStatus(
  response: HttpClientResponse.HttpClientResponse
): Effect.Effect<void, NotionError> {
  const retryAfterSeconds = parseRetryAfterSeconds(response);

  switch (response.status) {
    case 400:
    case 422:
      return readBody(response).pipe(
        Effect.tap((body) =>
          Effect.logWarning(`Notion BadRequest ${response.status}: ${body}`)
        ),
        Effect.flatMap((body) =>
          Effect.fail(new BadRequestError({ cause: body || undefined }))
        )
      );
    case 401:
      return Effect.fail(new InvalidApiKeyError({ cause: undefined }));
    case 403:
      return failWithBody(
        response,
        (body) => new ForbiddenError({ cause: body || undefined })
      );
    case 404:
      return Effect.fail(new NotFoundError({ cause: undefined }));
    case 409:
      return failWithBody(
        response,
        (body) => new ConflictError({ cause: body || undefined })
      );
    case 429:
      return failWithBody(response, (body) =>
        new RateLimitedError({
          ...(body.length > 0 ? { cause: body } : {}),
          ...(retryAfterSeconds !== undefined
            ? { retryAfterSeconds }
            : {}),
        })
      );
    case 503:
      return failWithBody(
        response,
        (body) => new ServiceUnavailableError({ cause: body || undefined })
      );
    default:
      if (response.status >= 400) {
        return failWithBody(
          response,
          (body) => new InternalServerError({ cause: body || undefined })
        );
      }
      return Effect.succeed(undefined);
  }
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
  if (status === 403) {
    return new ForbiddenError({ cause: body || undefined });
  }
  if (status === 404) {
    return new NotFoundError({ cause: undefined });
  }
  if (status === 400 || status === 422) {
    return new BadRequestError({ cause: body });
  }
  if (status === 409) {
    return new ConflictError({ cause: body || undefined });
  }
  if (status === 429) {
    return new RateLimitedError({ ...(body.length > 0 ? { cause: body } : {}) });
  }
  if (status === 503) {
    return new ServiceUnavailableError({ cause: body || undefined });
  }
  if (status >= 400) {
    return new InternalServerError({ cause: body });
  }
  return undefined;
};
