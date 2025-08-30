import { toWebHandlerLayerWith } from "@effect/platform/HttpApp";
import * as HttpMiddleware from "@effect/platform/HttpMiddleware";
import * as HttpRouter from "@effect/platform/HttpRouter";
import * as HttpServer from "@effect/platform/HttpServer";
// api/index.ts
import { Layer, Logger } from "effect";
import { AppConfigProviderLive } from "../src/config.js";
import { app } from "../src/router.js";
import { ArticlesRepository } from "../src/services/ArticlesRepository.js";
import { NotionClient } from "../src/services/NotionClient.js";
import { NotionService } from "../src/services/NotionService.js";

// CORS for serverless entrypoint (Bun/Edge style fetch handler)
const corsMiddleware = HttpMiddleware.cors({
  allowedOrigins: ["*"],
  allowedMethods: ["POST", "GET"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

// Adapter-level CORS headers for Web API responses
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const AppLayers = Layer.mergeAll(
  Logger.json,
  AppConfigProviderLive,
  // Provide external service layers so router handlers can access them
  NotionClient.Default,
  NotionService.Default,
  ArticlesRepository.Default,
  HttpServer.layerContext
);

// Materialize the Effect HttpApp as a Web handler, applying CORS middleware and logging
const { handler: webHandler } = toWebHandlerLayerWith(AppLayers, {
  toHandler: () => HttpRouter.toHttpApp(app),
  middleware: (self) => HttpMiddleware.logger(corsMiddleware(self)),
});

// Vercel Node v3 Web API entrypoint: (Request) => Promise<Response>
export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    const response = await webHandler(request);
    // Ensure CORS headers are present and avoid streaming lock issues
    const resHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders)) {
      if (!resHeaders.has(k)) resHeaders.set(k, v);
    }
    const bodyBuffer = await response.arrayBuffer();
    return new Response(bodyBuffer, {
      status: response.status,
      headers: resHeaders,
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
          ...corsHeaders,
          "content-type": "application/json; charset=utf-8",
          "x-request-id": requestId,
        },
      }
    );
  }
}
