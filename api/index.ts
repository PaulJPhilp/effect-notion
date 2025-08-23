// api/index.ts
import { Effect, Logger, Layer } from "effect";
import * as HttpApp from "@effect/platform/HttpApp";
import * as HttpMiddleware from "@effect/platform/HttpMiddleware";
import { app } from "../src/router.js";
import { NotionService } from "../src/NotionService.js";
import { AppConfigProviderLive } from "../src/config.js";

// CORS for serverless entrypoint (Bun/Edge style fetch handler)
const corsMiddleware = HttpMiddleware.cors({
  allowedOrigins: ["*"],
  allowedMethods: ["POST", "GET"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

const AppLayers = Layer.mergeAll(
  Logger.json,
  AppConfigProviderLive,
  NotionService.Default,
);

// Initialize the web handler with proper error handling
let webHandler: (request: Request) => Promise<Response>;

// Initialize handler synchronously to avoid async issues in serverless
try {
  const result = HttpApp.toWebHandlerLayer(app, AppLayers, {
    middleware: corsMiddleware,
  });
  webHandler = result.handler;
  console.log("Web handler initialized successfully");
} catch (error) {
  console.error("Failed to initialize web handler:", error);
  // Create a fallback handler for health check
  webHandler = async (request: Request) => {
    if (request.url.endsWith('/api/health')) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    return new Response(JSON.stringify({ error: "Server initialization failed" }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  };
}

// Vercel Node.js (serverless) default export: (req, res)
import type { IncomingMessage, ServerResponse } from "http";
// ...
export default async function nodeHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    console.log(`Handling ${req.method} request to ${req.url}`);
    console.log(`Request object keys: ${Object.keys(req)}`);
    console.log(`Request headers: ${JSON.stringify(req.headers)}`);
    
    const proto = (req.headers["x-forwarded-proto"] as string) || "https";
    const host = (req.headers["x-forwarded-host"] as string) || req.headers.host;
    const url = `${proto}://${host}${req.url}`;
    
    console.log(`Constructed URL: ${url}`);
    console.log(`URL object: ${JSON.stringify({ pathname: new URL(url).pathname, search: new URL(url).search })}`);

    const init: RequestInit = {
      method: req.method,
      headers: req.headers as Record<string, string>,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      // For POST requests, we need to read the body properly
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();
      console.log(`Request body: ${body}`);
      init.body = body;
    }

    const request = new Request(url, init);
    console.log(`Created Request object: ${request.method} ${request.url}`);
    
    // Try the fallback handler first for health check
    if (url.endsWith('/api/health')) {
      console.log("Using fallback handler for health check");
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    
    const response = await webHandler(request);
    
    console.log(`Response status: ${response.status}`);

    // Write status and headers
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));

    // Stream body back
    const arrayBuffer = await response.arrayBuffer();
    res.end(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error("Handler error:", err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({ error: "Internal Server Error", detail: String(err) }),
    );
  }
}

// Hint to Vercel for runtime selection (Node.js 20)
export const config = { runtime: "nodejs20.x" } as const;
