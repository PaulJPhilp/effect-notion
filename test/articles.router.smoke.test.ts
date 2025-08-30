import { NodeContext } from "@effect/platform-node"
import * as HttpApp from "@effect/platform/HttpApp"
import * as HttpServerResponse from "@effect/platform/HttpServerResponse"
import * as HttpRouter from "@effect/platform/HttpRouter"
import { Layer, Logger, Effect } from "effect"
import { describe, expect, it } from "vitest"
import { app } from "../src/router.js"
import { ArticlesRepository } from "../src/services/ArticlesRepository.js"
import type { BaseEntity } from "../src/domain/logical/Common.js"
import { AppConfigProviderLive } from "../src/config.js"
import { NotionClient } from "../src/NotionClient.js"
import { NotionService } from "../src/NotionService.js"

const stubEntity: BaseEntity = {
  id: "blog_123",
  source: "blog",
  pageId: "123",
  databaseId: "db",
  name: "Test",
  description: "Desc",
  createdAt: new Date(0),
  updatedAt: new Date(0),
  createdBy: "u1",
  updatedBy: "u2",
  type: "post",
  tags: ["x"],
  status: "published",
  publishedAt: new Date(0),
}

const stubImpl = {
  list: () =>
    Effect.succeed({
      results: [stubEntity],
      hasMore: false,
      nextCursor: undefined,
    }),
  get: () => Effect.succeed(stubEntity),
  create: () => Effect.succeed(stubEntity),
  update: () => Effect.succeed(stubEntity),
  delete: () => Effect.void,
} as unknown as ArticlesRepository

const StubLayer = Layer.succeed(ArticlesRepository, stubImpl)

const TestLayer = Layer.mergeAll(
  Logger.json,
  NodeContext.layer,
  AppConfigProviderLive,
  NotionClient.Default,
  NotionService.Default,
  StubLayer
)

const { handler: testApp } = HttpApp.toWebHandlerLayer(app, TestLayer)

describe("articles router smoke", () => {
  it("POST /api/articles/list returns stub results", async () => {
    const res = await testApp(
      new Request("http://localhost/api/articles/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "blog" }),
      })
    )
    if (res.status !== 200) {
      console.error("/api/articles/list body:", await res.text())
    }
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.results)).toBe(true)
    expect(body.results[0].id).toBe("blog_123")
  })

  it("POST /api/articles/create returns stub entity", async () => {
    const res = await testApp(
      new Request("http://localhost/api/articles/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "blog",
          data: { name: "New" },
        }),
      })
    )
    if (res.status !== 201) {
      console.error("/api/articles/create body:", await res.text())
    }
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toBe("blog_123")
  })

  it("POST /api/articles/update returns stub entity", async () => {
    const res = await testApp(
      new Request("http://localhost/api/articles/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source: "blog",
          pageId: "123",
          patch: { name: "Upd" },
        }),
      })
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe("blog_123")
  })

  it("POST /api/articles/delete returns 204", async () => {
    const res = await testApp(
      new Request("http://localhost/api/articles/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "blog", pageId: "123" }),
      })
    )
    if (res.status !== 204) {
      console.error("/api/articles/delete body:", await res.text())
    }
    expect(res.status).toBe(204)
  })

  it("GET /api/articles/get returns stub entity", async () => {
    const res = await testApp(
      new Request("http://localhost/api/articles/get?source=blog&pageId=123")
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.id).toBe("blog_123")
  })
})
