import { toWebHandlerLayerWith } from "@effect/platform/HttpApp";
import * as HttpMiddleware from "@effect/platform/HttpMiddleware";
import * as HttpRouter from "@effect/platform/HttpRouter";
import * as HttpServer from "@effect/platform/HttpServer";
// api/index.ts
import { Effect, Layer, Logger } from "effect";
import {
  AppConfig,
  AppConfigProviderLive,
  buildCorsOptions,
} from "../src/config.js";
import { RequestIdService } from "../src/http/requestId.js";
import { app } from "../src/router.js";
import { ArticlesRepository } from "../src/services/ArticlesRepository.js";
import { NotionClient } from "../src/services/NotionClient.js";
import { NotionService } from "../src/services/NotionService/service.js";

const LogLevelLayer = Layer.unwrapEffect(
  AppConfig.pipe(Effect.map((cfg) => Logger.minimumLogLevel(cfg.logLevel)))
);

const AppLayers = Layer.mergeAll(
  Logger.json,
  LogLevelLayer,
  AppConfigProviderLive,
  RequestIdService.Live,
  // Provide external service layers so router handlers can access them
  NotionClient.Default,
  NotionService.Default,
  ArticlesRepository.Default,
  HttpServer.layerContext
);

// Materialize the Effect HttpApp as a Web handler, applying CORS middleware and logging
const { handler: webHandler } = toWebHandlerLayerWith(AppLayers, {
  toHandler: () => HttpRouter.toHttpApp(app),
  middleware: (self) => {
    const corsMiddleware = HttpMiddleware.cors(
      buildCorsOptions({
        corsOrigin: "*",
        corsAllowedMethods: "POST,GET,OPTIONS",
        corsAllowedHeaders: "Content-Type,Authorization",
      })
    );

    return HttpMiddleware.logger(corsMiddleware(self));
  },
});

// Vercel Node v3 Web API entrypoint: (Request) => Promise<Response>
export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method === "OPTIONS") {
      // Let the CORS middleware handle OPTIONS requests
      const response = await webHandler(request);
      return new Response(null, {
        status: response.status,
        headers: response.headers,
      });
    }

    const response = await webHandler(request);

    // The middleware already handles CORS headers and request ID
    const bodyBuffer = await response.arrayBuffer();
    return new Response(bodyBuffer, {
      status: response.status,
      headers: response.headers,
    });
  } catch (err) {
    console.error("Web handler error:", err);
    // Produce normalized error JSON with request-id
    const requestId = Math.random().toString(36).slice(2, 10);
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        code: "InternalServerError",
        requestId,
        detail: String(err),
      }),
      {
        status: 500,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "x-request-id": requestId,
        },
      }
    );
  }
}
