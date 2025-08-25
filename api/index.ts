// api/index.ts
import { Logger, Layer } from "effect";
import * as HttpApp from "@effect/platform/HttpApp";
import * as HttpMiddleware from "@effect/platform/HttpMiddleware";
import { app } from "../src/router.js";
import { NotionClient } from "../src/NotionClient.js";
import { NotionService } from "../src/NotionService.js";
import { AppConfigProviderLive } from "../src/config.js";

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
);

// Materialize the Effect HttpApp as a Web handler
const { handler: webHandler } = HttpApp.toWebHandlerLayer(app, AppLayers);

// Vercel Node v3 Web API entrypoint: (Request) => Promise<Response>
export default async function handler(request: Request): Promise<Response> {
  try {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    const response = await webHandler(request);
    // Ensure CORS headers are present
    const resHeaders = new Headers(response.headers);
    for (const [k, v] of Object.entries(corsHeaders)) {
      if (!resHeaders.has(k)) resHeaders.set(k, v);
    }
    return new Response(response.body, {
      status: response.status,
      headers: resHeaders,
    });
  } catch (err) {
    console.error("Web handler error:", err);
    return new Response(
      JSON.stringify({ error: "Internal Server Error", detail: String(err) }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "content-type": "application/json; charset=utf-8",
        },
      },
    );
  }
}
