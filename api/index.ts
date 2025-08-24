// api/index.ts
import { Effect, Logger, Layer } from "effect";
import * as HttpApp from "@effect/platform/HttpApp";
import * as HttpMiddleware from "@effect/platform/HttpMiddleware";
import { app } from "../src/router.js";
import { NotionClient } from "../src/NotionClient.js";
import { NotionService } from "../src/NotionService.js";
import { AppConfigProviderLive } from "../src/config.js";
// Vercel Node.js v3 handler using Node's IncomingMessage/ServerResponse
import type { IncomingMessage, ServerResponse } from "http";

// CORS for serverless entrypoint (Bun/Edge style fetch handler)
const corsMiddleware = HttpMiddleware.cors({
  allowedOrigins: ["*"],
  allowedMethods: ["POST", "GET"],
  allowedHeaders: ["Content-Type", "Authorization"],
});

const AppLayers = Layer.mergeAll(
  Logger.json,
  AppConfigProviderLive,
  // Provide external service layers so router handlers can access them
  NotionClient.Default,
  NotionService.Default,
);

// Initialize the web handler with proper error handling
/**
 * Materialized web handler
 *
 * We keep the domain "app" in Effect-land (`src/router.ts` builds an
 * `HttpApp` as pure Effect). At the platform boundary (Vercel Node v3),
 * we must expose a Fetch-compatible function `(Request) => Promise<Response>`.
 *
 * `HttpApp.toWebHandlerLayer(app, AppLayers)` wires the `Layer` graph and
 * materializes the Effect into an async function by running it under an
 * Effect runtime (similar to `Effect.runPromise`). From this point on, the
 * adapter deals with concrete `Request`/`Response` values and Node I/O.
 *
 * Why not export an Effect here?
 * - Vercel invokes an async handler and expects us to write to
 *   `ServerResponse`. Returning an `Effect` would never be executed by
 *   the platform.
 * - Tests or local servers can still stay in Effect-land by importing
 *   `app` from `src/router.ts` and running it with layers using
 *   `Effect.runPromise` or `HttpApp.runServer`.
 */
let webHandler: (request: Request) => Promise<Response>;

// Initialize handler synchronously to avoid async issues in serverless
try {
  const result = HttpApp.toWebHandlerLayer(app, AppLayers);
  webHandler = result.handler;
} catch (error) {
  console.error("Failed to initialize web handler:", error);
  // Fallback handler when initialization fails: always report 500
  webHandler = async (_request: Request) =>
    new Response(
      JSON.stringify({ error: "Server initialization failed" }),
      {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }
    );
}


/**
 * Vercel Node entrypoint
 *
 * The platform contract is an async function that writes to
 * `ServerResponse`. We bridge from Fetch `Request`/`Response` (produced
 * by the Effect-backed `webHandler`) to Node's `IncomingMessage`/
 * `ServerResponse` by copying status, headers, and body.
 */
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const proto = (req.headers["x-forwarded-proto"] as string) || "https";
    const host = (req.headers["x-forwarded-host"] as string) || req.headers.host;
    const url = `${proto}://${host}${req.url}`;

    // Normalize headers for Fetch Request
    const normalizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") normalizedHeaders[key] = value;
      else if (Array.isArray(value)) normalizedHeaders[key] = value.join(", ");
    }

    const init: RequestInit = { method: req.method, headers: normalizedHeaders };
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      init.body = Buffer.concat(chunks).toString();
    }

    const request = new Request(url, init);
    // Minimal adapter logs
    console.log(`[adapter] ${req.method} ${url} -> start`);
    const response = await webHandler(request);
    console.log(`[adapter] ${req.method} ${url} -> status ${response.status}`);
    // Status and headers
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'content-length') return;
      res.setHeader(key, value);
    });
    // Add diagnostic headers
    try {
      const path = req.url ?? '/';
      res.setHeader('x-adapter-start', `${req.method} ${path}`);
      res.setHeader('x-adapter-status', String(response.status));
    } catch {}

    // Body: prefer arrayBuffer, fallback to text
    try {
      const ab = await response.arrayBuffer();
      res.end(Buffer.from(ab));
    } catch {
      try {
        const text = await response.text();
        if (!res.getHeader('content-type')) {
          res.setHeader('content-type', 'text/plain; charset=utf-8');
        }
        res.end(text);
      } catch (e2) {
        console.error("Handler body serialization error:", e2);
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    }
  } catch (err) {
    console.error("Handler error:", err);
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    try {
      const path = (typeof (err as any)?.url === 'string') ? (err as any).url : (typeof (err as any)?.request?.url === 'string') ? (err as any).request.url : (typeof (err as any)?.req?.url === 'string') ? (err as any).req.url : req.url ?? '/';
      res.setHeader('x-adapter-start', `${req.method} ${path}`);
      res.setHeader('x-adapter-status', '500');
    } catch {}
    res.end(JSON.stringify({ error: "Internal Server Error", detail: String(err) }));
  }
}
