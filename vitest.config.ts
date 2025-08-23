import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // Optional: keep '@' alias if you want to use it in tests
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: [
      "dist/**", // do not run compiled JS tests
      "node_modules/**",
    ],
  },
});
