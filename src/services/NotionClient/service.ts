import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import * as NotionSchema from "../../NotionSchema.js";
import { Effect } from "effect";
import type { NotionClientApi } from "./api.js";
import { withNotionHeaders, createPerformRequest, createPerformRequestUnit } from "./helpers.js";

export class NotionClient extends Effect.Service<NotionClient>()(
  "NotionClient",
  {
    accessors: true,
    dependencies: [FetchHttpClient.layer],
    effect: Effect.gen(function* () {
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.retryTransient({ times: 5 })
      );

      const performRequest = createPerformRequest(client);
      const performRequestUnit = createPerformRequestUnit(client);

      const svc: NotionClientApi = {
        retrievePage: (apiKey, pageId) =>
          performRequest(
            HttpClientRequest.get(
              `https://api.notion.com/v1/pages/${pageId}`
            ).pipe(withNotionHeaders(apiKey)),
            NotionSchema.PageSchema
          ),

        createPage: (apiKey, databaseId, properties) =>
          performRequest(
            HttpClientRequest.post(`https://api.notion.com/v1/pages`).pipe(
              HttpClientRequest.bodyUnsafeJson({
                parent: { database_id: databaseId },
                properties,
              }),
              withNotionHeaders(apiKey)
            ),
            NotionSchema.PageSchema
          ),

        updatePage: (apiKey, pageId, body) =>
          performRequest(
            HttpClientRequest.patch(
              `https://api.notion.com/v1/pages/${pageId}`
            ).pipe(
              HttpClientRequest.bodyUnsafeJson(body),
              withNotionHeaders(apiKey)
            ),
            NotionSchema.PageSchema
          ),

        retrieveDatabase: (apiKey, databaseId) =>
          performRequest(
            HttpClientRequest.get(
              `https://api.notion.com/v1/databases/${databaseId}`
            ).pipe(withNotionHeaders(apiKey)),
            NotionSchema.DatabaseSchema
          ),

        queryDatabase: (apiKey, databaseId, body) =>
          performRequest(
            HttpClientRequest.post(
              `https://api.notion.com/v1/databases/${databaseId}/query`
            ).pipe(
              body && (body.filter || body.sorts || body.start_cursor || body.page_size)
                ? HttpClientRequest.bodyUnsafeJson(body)
                : (req) => req,
              withNotionHeaders(apiKey)
            ),
            NotionSchema.PageListResponseSchema
          ),

        retrieveBlockChildren: (apiKey, pageId, cursor) =>
          performRequest(
            HttpClientRequest.get(
              cursor
                ? `https://api.notion.com/v1/blocks/${pageId}/children?start_cursor=${encodeURIComponent(
                    cursor
                  )}`
                : `https://api.notion.com/v1/blocks/${pageId}/children`
            ).pipe(withNotionHeaders(apiKey)),
            NotionSchema.BlockListResponseSchema
          ),

        deleteBlock: (apiKey, blockId) =>
          performRequestUnit(
            HttpClientRequest.del(
              `https://api.notion.com/v1/blocks/${blockId}`
            ).pipe(withNotionHeaders(apiKey))
          ),

        appendBlockChildren: (apiKey, pageId, blocks) =>
          HttpClientRequest.patch(
            `https://api.notion.com/v1/blocks/${pageId}/children`
          ).pipe(
            HttpClientRequest.bodyUnsafeJson({ children: blocks }),
            withNotionHeaders(apiKey),
            (req) => performRequest(req, NotionSchema.BlockListResponseSchema)
          ),
      };

      return svc;
    }),
  }
) {}
