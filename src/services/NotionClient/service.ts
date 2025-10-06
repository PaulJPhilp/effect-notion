import * as FetchHttpClient from "@effect/platform/FetchHttpClient";
import * as HttpClient from "@effect/platform/HttpClient";
import * as HttpClientRequest from "@effect/platform/HttpClientRequest";
import { Effect } from "effect";
import * as NotionSchema from "../../NotionSchema.js";
import { AppConfig } from "../../config.js";
import type { NotionClientApi } from "./api.js";
import {
  createPerformRequest,
  createPerformRequestUnit,
  withNotionHeaders,
} from "./helpers.js";

export class NotionClient extends Effect.Service<NotionClient>()(
  "NotionClient",
  {
    accessors: true,
    dependencies: [FetchHttpClient.layer],
    effect: Effect.gen(function* () {
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.retryTransient({ times: 5 })
      );

      const { notionApiKey, notionHttpTimeoutMs } = yield* AppConfig;
      const performRequest = createPerformRequest(client);
      const performRequestUnit = createPerformRequestUnit(client);

      const svc: NotionClientApi = {
        retrievePage: (pageId) =>
          performRequest(
            HttpClientRequest.get(
              `https://api.notion.com/v1/pages/${pageId}`
            ).pipe(withNotionHeaders(notionApiKey)),
            NotionSchema.PageSchema,
            notionHttpTimeoutMs
          ),

        createPage: (databaseId, properties) =>
          performRequest(
            HttpClientRequest.post("https://api.notion.com/v1/pages").pipe(
              HttpClientRequest.bodyUnsafeJson({
                parent: { database_id: databaseId },
                properties,
              }),
              withNotionHeaders(notionApiKey)
            ),
            NotionSchema.PageSchema,
            notionHttpTimeoutMs
          ),

        updatePage: (pageId, body) =>
          performRequest(
            HttpClientRequest.patch(
              `https://api.notion.com/v1/pages/${pageId}`
            ).pipe(
              HttpClientRequest.bodyUnsafeJson(body),
              withNotionHeaders(notionApiKey)
            ),
            NotionSchema.PageSchema,
            notionHttpTimeoutMs
          ),

        retrieveDatabase: (databaseId) =>
          performRequest(
            HttpClientRequest.get(
              `https://api.notion.com/v1/databases/${databaseId}`
            ).pipe(withNotionHeaders(notionApiKey)),
            NotionSchema.DatabaseSchema,
            notionHttpTimeoutMs
          ),

        queryDatabase: (databaseId, body) =>
          performRequest(
            HttpClientRequest.post(
              `https://api.notion.com/v1/databases/${databaseId}/query`
            ).pipe(
              body &&
                (body.filter ||
                  body.sorts ||
                  body.start_cursor ||
                  body.page_size)
                ? HttpClientRequest.bodyUnsafeJson(body)
                : (req) => req,
              withNotionHeaders(notionApiKey)
            ),
            NotionSchema.PageListResponseSchema,
            notionHttpTimeoutMs
          ),

        retrieveBlockChildren: (pageId, cursor) =>
          performRequest(
            HttpClientRequest.get(
              cursor
                ? `https://api.notion.com/v1/blocks/${pageId}/children?start_cursor=${encodeURIComponent(
                    cursor
                  )}`
                : `https://api.notion.com/v1/blocks/${pageId}/children`
            ).pipe(withNotionHeaders(notionApiKey)),
            NotionSchema.BlockListResponseSchema,
            notionHttpTimeoutMs
          ),

        deleteBlock: (blockId) =>
          performRequestUnit(
            HttpClientRequest.del(
              `https://api.notion.com/v1/blocks/${blockId}`
            ).pipe(withNotionHeaders(notionApiKey)),
            notionHttpTimeoutMs
          ),

        appendBlockChildren: (pageId, blocks) =>
          HttpClientRequest.patch(
            `https://api.notion.com/v1/blocks/${pageId}/children`
          ).pipe(
            HttpClientRequest.bodyUnsafeJson({ children: blocks }),
            withNotionHeaders(notionApiKey),
            (req) =>
              performRequest(
                req,
                NotionSchema.BlockListResponseSchema,
                notionHttpTimeoutMs
              )
          ),

        createDatabase: (parentPageId, title, properties) =>
          performRequest(
            HttpClientRequest.post("https://api.notion.com/v1/databases").pipe(
              HttpClientRequest.bodyUnsafeJson({
                parent: { page_id: parentPageId },
                title: [
                  {
                    type: "text",
                    text: { content: title },
                  },
                ],
                properties,
              }),
              withNotionHeaders(notionApiKey)
            ),
            NotionSchema.DatabaseSchema,
            notionHttpTimeoutMs
          ),
      };

      return svc;
    }),
  }
) {}
