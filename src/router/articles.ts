import * as HttpRouter from "@effect/platform/HttpRouter"
import * as HttpServerRequest from "@effect/platform/HttpServerRequest"
import * as HttpServerResponse from "@effect/platform/HttpServerResponse"
import { Effect, Schema } from "effect"
import type { ListParams, BaseEntity } from "../domain/logical/Common.js"
import { ListParams as ListParamsSchema } from "../domain/logical/Common.js"
import { ArticlesRepository } from "../services/ArticlesRepository.js"
import { badRequest } from "../errors.js"

// Schemas for route payloads
const GetRequest = Schema.Struct({
  source: Schema.String,
  pageId: Schema.String,
})

const CreateRequest = Schema.Struct({
  source: Schema.String,
  data: Schema.partial(Schema.Struct({
    name: Schema.String,
    description: Schema.optional(Schema.String),
    type: Schema.optional(Schema.String),
    tags: Schema.optional(Schema.Array(Schema.String)),
    status: Schema.optional(Schema.String),
    publishedAt: Schema.optional(Schema.DateFromSelf),
  })),
})

const UpdateRequest = Schema.Struct({
  source: Schema.String,
  pageId: Schema.String,
  patch: Schema.partial(Schema.Struct({
    name: Schema.String,
    description: Schema.optional(Schema.String),
    type: Schema.optional(Schema.String),
    tags: Schema.optional(Schema.Array(Schema.String)),
    status: Schema.optional(Schema.String),
    publishedAt: Schema.optional(Schema.DateFromSelf),
  })),
})

const DeleteRequest = Schema.Struct({
  source: Schema.String,
  pageId: Schema.String,
})

export const applyArticlesRoutes = <T extends { pipe: (...fns: Array<(self: any) => any>) => any }>(
  // Accept a generic router so composition preserves its type
  router: T
): T =>
  router.pipe(
    // List
    HttpRouter.post(
      "/api/articles/list",
      Effect.gen(function* () {
        const body: ListParams = yield* HttpServerRequest.schemaBodyJson(
          ListParamsSchema,
          { onExcessProperty: "error" }
        )
        const repo = yield* ArticlesRepository
        const result = yield* repo.list(body)
        return yield* HttpServerResponse.json(result)
      })
    ),

    // Get by id
    HttpRouter.get(
      "/api/articles/get",
      Effect.gen(function* () {
        const query = yield* HttpServerRequest.schemaSearchParams(GetRequest)
        if (!query.source || !query.pageId) {
          return yield* badRequest({ detail: "source and pageId required" })
        }
        const repo = yield* ArticlesRepository
        const entity: BaseEntity & { warnings?: ReadonlyArray<string> } = yield* repo.get({
          source: query.source,
          pageId: query.pageId,
        })
        if (entity.warnings && entity.warnings.length > 0) {
          yield* Effect.logWarning(
            `articles.get warnings pageId=${entity.pageId} source=${entity.source}: ${entity.warnings.join(", ")}`
          )
        }
        return yield* HttpServerResponse.json(entity)
      })
    ),

    // Create
    HttpRouter.post(
      "/api/articles/create",
      Effect.gen(function* () {
        const body = yield* HttpServerRequest.schemaBodyJson(CreateRequest, {
          onExcessProperty: "error",
        })
        const repo = yield* ArticlesRepository
        const entity = yield* repo.create({ source: body.source, data: body.data })
        return yield* HttpServerResponse.json(entity, { status: 201 })
      })
    ),

    // Update
    HttpRouter.post(
      "/api/articles/update",
      Effect.gen(function* () {
        const body = yield* HttpServerRequest.schemaBodyJson(UpdateRequest, {
          onExcessProperty: "error",
        })
        const repo = yield* ArticlesRepository
        const entity = yield* repo.update({
          source: body.source,
          pageId: body.pageId,
          patch: body.patch,
        })
        return yield* HttpServerResponse.json(entity)
      })
    ),

    // Delete (archive)
    HttpRouter.post(
      "/api/articles/delete",
      Effect.gen(function* () {
        const body = yield* HttpServerRequest.schemaBodyJson(DeleteRequest, {
          onExcessProperty: "error",
        })
        const repo = yield* ArticlesRepository
        yield* repo.delete({ source: body.source, pageId: body.pageId })
        return yield* HttpServerResponse.empty({ status: 204 })
      })
    )
  )

export default applyArticlesRoutes
