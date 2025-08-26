import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("Server", () => {
  it("should start and respond to a health check", async () => {
    const server = spawn("bun", ["start"], { env: { ...process.env } });
    await new Promise((resolve) => setTimeout(resolve, 12000));

    const response = await fetch("http://localhost:3000/api/health");
    // In CI without a configured NOTION_API_KEY, we expect 503
    expect([200, 503]).toContain(response.status);

    server.kill();
  }, 20000);
});
