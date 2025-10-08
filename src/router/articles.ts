import type { HttpBodyError } from "@effect/platform/HttpBody";
import * as HttpRouter from "@effect/platform/HttpRouter";
import type { RequestError } from "@effect/platform/HttpServerError";
import * as HttpServerRequest from "@effect/platform/HttpServerRequest";
import * as HttpServerResponse from "@effect/platform/HttpServerResponse";
import { Effect, Schema } from "effect";
import type { ParseError } from "effect/ParseResult";
import type { ListParams } from "../domain/logical/Common.js";
import { ListParams as ListParamsSchema } from "../domain/logical/Common.js";
import { badRequest } from "../errors.js";
import {
  type RequestIdService,
  addRequestIdToHeaders,
  getRequestId,
  setCurrentRequestId,
} from "../http/requestId.js";
import { ArticlesRepository } from "../services/ArticlesRepository.js";
import type { NotionError } from "../services/NotionClient/errors.js";

// Schemas for route payloads
const GetRequest = Schema.Struct({
  source: Schema.String,
  pageId: Schema.String,
});

const CreateRequest = Schema.Struct({
  source: Schema.String,
  data: Schema.partial(
    Schema.Struct({
      name: Schema.String,
      description: Schema.optional(Schema.String),
      type: Schema.optional(Schema.String),
      tags: Schema.optional(Schema.Array(Schema.String)),
      status: Schema.optional(Schema.String),
      publishedAt: Schema.optional(Schema.DateFromSelf),
    }),
  ),
});

const UpdateRequest = Schema.Struct({
  source: Schema.String,
  pageId: Schema.String,
  patch: Schema.partial(
    Schema.Struct({
      name: Schema.String,
      description: Schema.optional(Schema.String),
      type: Schema.optional(Schema.String),
      tags: Schema.optional(Schema.Array(Schema.String)),
      status: Schema.optional(Schema.String),
      publishedAt: Schema.optional(Schema.DateFromSelf),
    }),
  ),
});

const DeleteRequest = Schema.Struct({
  source: Schema.String,
  pageId: Schema.String,
});

export const applyArticlesRoutes = <E, R>(
  router: HttpRouter.HttpRouter<E, R>,
): HttpRouter.HttpRouter<
  E | RequestError | NotionError | HttpBodyError | ParseError,
  R | ArticlesRepository | RequestIdService
> =>
  router.pipe(
    // List
    HttpRouter.post(
      "/api/articles/list",
      Effect.gen(function* () {
        // Extract request ID and store in FiberRef for logging context
        const req = yield* HttpServerRequest.HttpServerRequest;
        const requestId = getRequestId(req.headers);
        yield* setCurrentRequestId(requestId);

        const body: ListParams = yield* HttpServerRequest.schemaBodyJson(
          ListParamsSchema,
          { onExcessProperty: "error" },
        );
        const repo = yield* ArticlesRepository;
        const result = yield* repo.list(body);

        // Add request ID to response headers
        return yield* HttpServerResponse.json(result).pipe(
          Effect.map((response) =>
            HttpServerResponse.setHeaders(
              addRequestIdToHeaders(response.headers, requestId),
            )(response),
          ),
        );
      }),
    ),

    // Get by id
    HttpRouter.get(
      "/api/articles/get",
      Effect.gen(function* () {
        // Extract request ID and store in FiberRef for logging context
        const req = yield* HttpServerRequest.HttpServerRequest;
        const requestId = getRequestId(req.headers);
        yield* setCurrentRequestId(requestId);

        const query = yield* HttpServerRequest.schemaSearchParams(GetRequest);
        if (!query.source || !query.pageId) {
          return yield* badRequest({ detail: "source and pageId required" });
        }
        const repo = yield* ArticlesRepository;
        const entity = yield* repo.get({
          source: query.source,
          pageId: query.pageId,
        });
        if (entity.warnings && entity.warnings.length > 0) {
          yield* Effect.logWarning(
            `articles.get warnings pageId=${entity.pageId} source=${
              entity.source
            }: ${entity.warnings.join(", ")}`,
          );
        }

        // Add request ID to response headers
        return yield* HttpServerResponse.json(entity).pipe(
          Effect.map((response) =>
            HttpServerResponse.setHeaders(
              addRequestIdToHeaders(response.headers, requestId),
            )(response),
          ),
        );
      }),
    ),

    // Create
    HttpRouter.post(
      "/api/articles/create",
      Effect.gen(function* () {
        // Extract request ID and store in FiberRef for logging context
        const req = yield* HttpServerRequest.HttpServerRequest;
        const requestId = getRequestId(req.headers);
        yield* setCurrentRequestId(requestId);

        const body = yield* HttpServerRequest.schemaBodyJson(CreateRequest, {
          onExcessProperty: "error",
        });
        const repo = yield* ArticlesRepository;
        const entity = yield* repo.create({
          source: body.source,
          data: omitUndefined(body.data),
        });

        // Add request ID to response headers
        return yield* HttpServerResponse.json(entity, {
          status: 201,
          headers: addRequestIdToHeaders({}, requestId),
        });
      }),
    ),

    // Update
    HttpRouter.post(
      "/api/articles/update",
      Effect.gen(function* () {
        // Extract request ID and store in FiberRef for logging context
        const req = yield* HttpServerRequest.HttpServerRequest;
        const requestId = getRequestId(req.headers);
        yield* setCurrentRequestId(requestId);

        const body: Schema.Schema.Type<typeof UpdateRequest> =
          yield* HttpServerRequest.schemaBodyJson(UpdateRequest, {
            onExcessProperty: "error",
          });
        const repo = yield* ArticlesRepository;
        const entity = yield* repo.update({
          source: body.source,
          pageId: body.pageId,
          patch: omitUndefined(body.patch),
        });

        // Add request ID to response headers
        return yield* HttpServerResponse.json(entity).pipe(
          Effect.map((response) =>
            HttpServerResponse.setHeaders(
              addRequestIdToHeaders(response.headers, requestId),
            )(response),
          ),
        );
      }),
    ),

    // Delete (archive)
    HttpRouter.post(
      "/api/articles/delete",
      Effect.gen(function* () {
        // Extract request ID and store in FiberRef for logging context
        const req = yield* HttpServerRequest.HttpServerRequest;
        const requestId = getRequestId(req.headers);
        yield* setCurrentRequestId(requestId);

        const body = yield* HttpServerRequest.schemaBodyJson(DeleteRequest, {
          onExcessProperty: "error",
        });
        const repo = yield* ArticlesRepository;
        yield* repo.delete({ source: body.source, pageId: body.pageId });

        // Add request ID to response headers
        return yield* HttpServerResponse.empty({
          status: 204,
          headers: addRequestIdToHeaders({}, requestId),
        });
      }),
    ),
  );

export default applyArticlesRoutes;

function omitUndefined<T extends Record<string, unknown>>(
  obj: T,
): { [K in keyof T]?: Exclude<T[K], undefined> } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as { [K in keyof T]?: Exclude<T[K], undefined> };
}
