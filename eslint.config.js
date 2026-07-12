import eslint from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "vendor/**",
      ".worktrees/**",
      ".superpowers/**",
      "playwright-report/**",
      "test-results/**",
      ".e2e/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    files: ["server/**/*.ts", "scripts/**/*.ts", "*.config.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["tests/**/*.{ts,tsx}", "src/test/**/*.ts", "vitest.config.ts"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
);
