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

/**
 * Centralized CORS configuration for both middleware and OPTIONS fast-path.
 * These values should match the environment defaults from config.ts.
 */
const CORS_CONFIG = {
  corsOrigin: "*",
  corsAllowedMethods: "POST,GET,OPTIONS",
  corsAllowedHeaders: "Content-Type,Authorization",
} as const;

const LogLevelLayer = Layer.unwrapEffect(
  AppConfig.pipe(Effect.map((cfg) => Logger.minimumLogLevel(cfg.logLevel))),
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
  HttpServer.layerContext,
);

// Materialize the Effect HttpApp as a Web handler, applying CORS middleware and logging
const { handler: webHandler } = toWebHandlerLayerWith(AppLayers, {
  toHandler: () => HttpRouter.toHttpApp(app),
  middleware: (self) => {
    const corsMiddleware = HttpMiddleware.cors(buildCorsOptions(CORS_CONFIG));
    return HttpMiddleware.logger(corsMiddleware(self));
  },
});

// Vercel Node v3 Web API entrypoint: (Request) => Promise<Response>
export default async function handler(request: Request): Promise<Response> {
  try {
    // Fast-path for OPTIONS preflight: respond immediately without
    // initializing the full Effect runtime
    if (request.method === "OPTIONS") {
      const cfg = buildCorsOptions(CORS_CONFIG);

      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": cfg.allowedOrigins?.[0] ?? "*",
          "Access-Control-Allow-Methods": CORS_CONFIG.corsAllowedMethods,
          "Access-Control-Allow-Headers": CORS_CONFIG.corsAllowedHeaders,
          "Access-Control-Max-Age": "86400",
        },
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
      },
    );
  }
}
