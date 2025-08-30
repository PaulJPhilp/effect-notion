import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as HttpClientResponse from "@effect/platform/HttpClientResponse";
import { Effect } from "effect";
import type * as S from "effect/Schema";
import * as NotionSchema from "../../NotionSchema.js";
import {
  BadRequestError,
  InternalServerError,
  InvalidApiKeyError,
  NotFoundError,
  type NotionError,
} from "./errors.js";

export const withNotionHeaders = (apiKey: string) =>
  HttpClientRequest.setHeaders({
    Authorization: `Bearer ${apiKey}`,
    "Notion-Version": "2022-06-28",
    "Content-Type": "application/json",
  });

export const createPerformRequest = (
  client: HttpClient.HttpClient
) =>
  <A, I>(
    request: HttpClientRequest.HttpClientRequest,
    schema: S.Schema<A, I, never>
  ): Effect.Effect<A, NotionError> =>
    client.execute(request).pipe(
      Effect.mapError((cause) => new InternalServerError({ cause })),
      Effect.flatMap((response) => {
        if (response.status === 401) {
          return Effect.fail(
            new InvalidApiKeyError({ cause: undefined })
          ) as Effect.Effect<never, NotionError>;
        }
        if (response.status === 404) {
          return Effect.fail(
            new NotFoundError({ cause: undefined })
          ) as Effect.Effect<never, NotionError>;
        }
        if (response.status === 400 || response.status === 422) {
          return response.text.pipe(
            Effect.catchAll(() => Effect.succeed("")),
            Effect.tap((body) =>
              Effect.logWarning(`Notion BadRequest ${response.status}: ${body}`)
            ),
            Effect.flatMap((body) =>
              Effect.fail(new BadRequestError({ cause: `${response.status}:${body}` }))
            )
          ) as Effect.Effect<never, NotionError>;
        }
        if (response.status >= 400) {
          return response.text.pipe(
            Effect.catchAll(() => Effect.succeed("")),
            Effect.tap((body) =>
              Effect.logWarning(`Notion Error ${response.status}: ${body}`)
            ),
            Effect.flatMap((body) =>
              Effect.fail(new InternalServerError({ cause: `${response.status}:${body}` }))
            )
          ) as Effect.Effect<never, NotionError>;
        }

        return HttpClientResponse.schemaBodyJson(schema)(response).pipe(
          Effect.mapError((cause) => new InternalServerError({ cause }))
        );
      })
    );

export const createPerformRequestUnit = (
  client: HttpClient.HttpClient
) =>
  (
    request: HttpClientRequest.HttpClientRequest
  ): Effect.Effect<void, NotionError> =>
    client.execute(request).pipe(
      Effect.mapError((cause) => new InternalServerError({ cause })),
      Effect.flatMap((response) => {
        if (response.status === 401)
          return Effect.fail(
            new InvalidApiKeyError({ cause: undefined })
          ) as Effect.Effect<never, NotionError>;
        if (response.status === 404)
          return Effect.fail(
            new NotFoundError({ cause: undefined })
          ) as Effect.Effect<never, NotionError>;
        if (response.status === 400 || response.status === 422)
          return response.text.pipe(
            Effect.catchAll(() => Effect.succeed("")),
            Effect.tap((body) =>
              Effect.logWarning(`Notion BadRequest ${response.status}: ${body}`)
            ),
            Effect.flatMap((body) =>
              Effect.fail(new BadRequestError({ cause: body }))
            )
          ) as Effect.Effect<never, NotionError>;
        if (response.status >= 400)
          return response.text.pipe(
            Effect.catchAll(() => Effect.succeed("")),
            Effect.tap((body) =>
              Effect.logWarning(`Notion Error ${response.status}: ${body}`)
            ),
            Effect.flatMap((body) =>
              Effect.fail(new InternalServerError({ cause: body }))
            )
          ) as Effect.Effect<never, NotionError>;

        return Effect.succeed(void 0);
      })
    );

// Test-only helper mirroring status mapping
export const __test__mapStatusToError = (
  status: number,
  body: string,
): NotionError | undefined => {
  if (status === 401) return new InvalidApiKeyError({ cause: undefined });
  if (status === 404) return new NotFoundError({ cause: undefined });
  if (status === 400 || status === 422)
    return new BadRequestError({ cause: body });
  if (status >= 400) return new InternalServerError({ cause: body });
  return undefined;
};
