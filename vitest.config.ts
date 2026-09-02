import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Two projects: pure-logic tests run in Node (shared/ + cli/), React component
// tests run in jsdom (src/). Date-sensitive tests rely on TZ=Europe/Prague set
// by the `test` script, since Date reads TZ at process start.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["shared/**/*.test.ts", "cli/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
  },
});
