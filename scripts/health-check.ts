#!/usr/bin/env bun
/**
 * Health Check Script for Live Proxy Server
 *
 * Tests the health of a deployed proxy server by making HTTP requests
 * to various endpoints and validating responses.
 *
 * Usage:
 *   bun scripts/health-check.ts [BASE_URL]
 *
 * Examples:
 *   bun scripts/health-check.ts
 *   bun scripts/health-check.ts https://your-app.vercel.app
 *   bun scripts/health-check.ts http://localhost:3000
 */

import { Effect, pipe } from "effect";

// --- Types ---
interface HealthResponse {
  ok: boolean;
  env: string;
  hasApiKey: boolean;
  checkedDatabaseId: string | null;
  notionOk?: boolean;
  error: string | null;
}

interface CheckResult {
  name: string;
  success: boolean;
  status?: number;
  duration: number;
  error?: string;
  details?: Record<string, unknown>;
}

// --- Configuration ---
const DEFAULT_BASE_URL = "http://localhost:3000";
const TIMEOUT_MS = 10000;

// --- Utilities ---
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

const colorize = (text: string, color: "green" | "red" | "yellow"): string => {
  const colors = {
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
  };
  const reset = "\x1b[0m";
  return `${colors[color]}${text}${reset}`;
};

// --- Health Check Functions ---
const checkHealth = (baseUrl: string): Effect.Effect<CheckResult, never> =>
  Effect.tryPromise({
    try: async () => {
      const start = Date.now();
      const url = `${baseUrl}/api/health`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - start;

      const body = (await response.json()) as HealthResponse;
      const success = response.status === 200 && body.ok === true;

      return {
        name: "Health Endpoint",
        success,
        status: response.status,
        duration,
        details: body as unknown as Record<string, unknown>,
      } as CheckResult;
    },
    catch: (error) => error,
  }).pipe(
    Effect.catchAll((error) =>
      Effect.succeed({
        name: "Health Endpoint",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
      } as CheckResult),
    ),
  );

const checkCors = (baseUrl: string): Effect.Effect<CheckResult, never> =>
  Effect.tryPromise({
    try: async () => {
      const start = Date.now();
      const url = `${baseUrl}/api/health`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(url, {
        method: "OPTIONS",
        headers: {
          Origin: "https://example.com",
          "Access-Control-Request-Method": "GET",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - start;

      const corsHeaders = {
        "access-control-allow-origin": response.headers.get(
          "access-control-allow-origin",
        ),
        "access-control-allow-methods": response.headers.get(
          "access-control-allow-methods",
        ),
        "access-control-allow-headers": response.headers.get(
          "access-control-allow-headers",
        ),
      };

      const success =
        response.status === 204 &&
        corsHeaders["access-control-allow-origin"] !== null;

      return {
        name: "CORS Preflight",
        success,
        status: response.status,
        duration,
        details: corsHeaders,
      } as CheckResult;
    },
    catch: (error) => error,
  }).pipe(
    Effect.catchAll((error) =>
      Effect.succeed({
        name: "CORS Preflight",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
      } as CheckResult),
    ),
  );

const checkNotFound = (baseUrl: string): Effect.Effect<CheckResult, never> =>
  Effect.tryPromise({
    try: async () => {
      const start = Date.now();
      const url = `${baseUrl}/api/nonexistent-endpoint`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - start;

      const success = response.status === 404;

      return {
        name: "404 Handling",
        success,
        status: response.status,
        duration,
        details: {
          expectedStatus: 404,
          actualStatus: response.status,
        },
      } as CheckResult;
    },
    catch: (error) => error,
  }).pipe(
    Effect.catchAll((error) =>
      Effect.succeed({
        name: "404 Handling",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
      } as CheckResult),
    ),
  );

const checkRequestId = (baseUrl: string): Effect.Effect<CheckResult, never> =>
  Effect.tryPromise({
    try: async () => {
      const start = Date.now();
      const url = `${baseUrl}/api/health`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const duration = Date.now() - start;

      const requestId = response.headers.get("x-request-id");
      const success = requestId !== null && requestId.length > 0;

      return {
        name: "Request ID Header",
        success,
        status: response.status,
        duration,
        details: {
          "x-request-id": requestId,
        },
      } as CheckResult;
    },
    catch: (error) => error,
  }).pipe(
    Effect.catchAll((error) =>
      Effect.succeed({
        name: "Request ID Header",
        success: false,
        duration: 0,
        error: error instanceof Error ? error.message : String(error),
      } as CheckResult),
    ),
  );

// --- Reporting ---
const printResult = (result: CheckResult): void => {
  const statusIcon = result.success
    ? colorize("✓", "green")
    : colorize("✗", "red");
  const durationStr = colorize(formatDuration(result.duration), "yellow");

  console.log(`${statusIcon} ${result.name} [${durationStr}]`);

  if (result.status !== undefined) {
    console.log(`  Status: ${result.status}`);
  }

  if (result.error) {
    console.log(`  Error: ${colorize(result.error, "red")}`);
  }

  if (result.details) {
    console.log(
      `  Details: ${JSON.stringify(result.details, null, 2)
        .split("\n")
        .map((line, i) => (i === 0 ? line : `           ${line}`))
        .join("\n")}`,
    );
  }

  console.log("");
};

const printSummary = (results: CheckResult[]): void => {
  const passed = results.filter((r) => r.success).length;
  const total = results.length;
  const allPassed = passed === total;

  console.log("─".repeat(60));
  console.log(
    allPassed
      ? colorize(`✓ All ${total} checks passed`, "green")
      : colorize(`✗ ${passed}/${total} checks passed`, "red"),
  );
  console.log("─".repeat(60));
};

// --- Main Program ---
const program = Effect.gen(function* () {
  const baseUrl = process.argv[2] || DEFAULT_BASE_URL;

  console.log("─".repeat(60));
  console.log(colorize("Health Check for Live Proxy Server", "green"));
  console.log(`Target: ${baseUrl}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms`);
  console.log("─".repeat(60));
  console.log("");

  // Run all checks
  const results: CheckResult[] = [];

  const healthResult = yield* checkHealth(baseUrl);
  printResult(healthResult);
  results.push(healthResult);

  const corsResult = yield* checkCors(baseUrl);
  printResult(corsResult);
  results.push(corsResult);

  const notFoundResult = yield* checkNotFound(baseUrl);
  printResult(notFoundResult);
  results.push(notFoundResult);

  const requestIdResult = yield* checkRequestId(baseUrl);
  printResult(requestIdResult);
  results.push(requestIdResult);

  printSummary(results);

  // Exit with appropriate code
  const allPassed = results.every((r) => r.success);
  return allPassed ? 0 : 1;
});

// Execute the program
pipe(program, Effect.runPromise)
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error(colorize("Fatal error:", "red"), error);
    process.exit(1);
  });
