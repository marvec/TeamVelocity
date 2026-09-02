import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "coverage",
      "playwright-report",
      "test-results",
      "node_modules",
      "public/data/**",
    ],
  },

  // All TypeScript, type-aware.
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // TypeScript already checks for undefined identifiers; no-undef only causes
      // false positives on DOM/node globals under type-aware linting.
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // Browser SPA: React rules + the hard architectural boundary from PRD §3.
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "octokit",
              message: "The SPA (src/) must never touch GitHub — Octokit is CLI-only (PRD §3).",
            },
          ],
          patterns: [
            {
              group: ["@octokit/*", "octokit/*"],
              message: "The SPA (src/) must never touch GitHub (PRD §3).",
            },
            {
              group: ["**/cli/**", "**/cli", "cli/*"],
              message: "src/ must never import from cli/ (PRD §3).",
            },
          ],
        },
      ],
    },
  },

  // Node code: CLI puller, shared aggregation, and build/test config files.
  {
    files: ["cli/**/*.ts", "shared/**/*.ts", "*.config.{ts,js}", "vitest.setup.ts"],
    languageOptions: { globals: globals.node },
  },
);
