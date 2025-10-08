import { NodeContext } from "@effect/platform-node";
import * as HttpApp from "@effect/platform/HttpApp";
import { Layer, Logger } from "effect";
import { describe, expect, it } from "vitest";
import { NotionClient } from "../src/NotionClient.js";
import { NotionService } from "../src/NotionService.js";
import { AppConfigProviderLive } from "../src/config.js";
import { RequestIdService } from "../src/http/requestId.js";
import { app } from "../src/router.js";
import { ArticlesRepository } from "../src/services/ArticlesRepository.js";

const { NOTION_API_KEY, NOTION_DB_ARTICLES_BLOG } = process.env;

const TestLayer = Layer.mergeAll(
  Logger.json,
  AppConfigProviderLive,
  NodeContext.layer,
  RequestIdService.Live,
  ArticlesRepository.Default,
  NotionClient.Default,
  NotionService.Default,
);

const { handler: testApp } = HttpApp.toWebHandlerLayer(app, TestLayer);

// Live CRUD integration covering create -> get -> update -> delete
// Guards on env presence to avoid accidental live hits.
// Creates a temporary page and cleans it up.

describe.skipIf(!NOTION_API_KEY || !NOTION_DB_ARTICLES_BLOG)(
  "Articles Router CRUD (integration)",
  () => {
    it("should create, get, update, and delete an article (blog)", async () => {
      const unique = `itest-${Date.now()}`;

      // Create
      const createRes = await testApp(
        new Request("http://localhost/api/articles/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source: "blog",
            data: { name: `${unique} name`, description: "tmp item" },
          }),
        }),
      );
      if (createRes.status !== 201) {
        console.error("create body:", await createRes.text());
      }
      expect(createRes.status).toBe(201);
      const created = await createRes.json();
      expect(created?.pageId).toBeTruthy();
      const pageId: string = created.pageId;

      // Get by id
      const getRes = await testApp(
        new Request(
          `http://localhost/api/articles/get?source=blog&pageId=${pageId}`,
          { method: "GET" },
        ),
      );
      if (getRes.status !== 200) {
        console.error("get body:", await getRes.text());
      }
      expect(getRes.status).toBe(200);
      const got = await getRes.json();
      expect(got?.id).toBeTruthy();

      // Update
      const updateRes = await testApp(
        new Request("http://localhost/api/articles/update", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            source: "blog",
            pageId,
            patch: { name: `${unique} name updated` },
          }),
        }),
      );
      if (updateRes.status !== 200) {
        console.error("update body:", await updateRes.text());
      }
      expect(updateRes.status).toBe(200);

      // Delete (archive)
      const deleteRes = await testApp(
        new Request("http://localhost/api/articles/delete", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: "blog", pageId }),
        }),
      );
      if (deleteRes.status !== 204) {
        console.error("delete body:", await deleteRes.text());
      }
      expect(deleteRes.status).toBe(204);
    }, 20000);
  },
);
