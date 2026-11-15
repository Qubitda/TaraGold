import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores([
    "dist/**",
    ".next/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "src/lib/api/schema.d.ts",
    "public/sw.js",
    "tools/mock-api-plugin.ts",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // FAZ2 borç — BACKLOG U-FE-STRICT-HOOKS
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/static-components": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-useless-assignment": "off",
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next",
              message: "Next.js yasak (ADR-0031). Vite + React Router kullanın.",
            },
            {
              name: "next/navigation",
              message: "Next.js yasak (ADR-0031).",
            },
            {
              name: "next/link",
              message: "Next.js yasak (ADR-0031).",
            },
            {
              name: "next/image",
              message: "Next.js yasak (ADR-0031).",
            },
          ],
          patterns: [
            {
              group: ["next/*"],
              message: "Next.js yasak (ADR-0031).",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "vite.config.ts",
      "playwright.config.ts",
      "eslint.config.mjs",
      "tools/**/*.{ts,mjs}",
      "e2e/**/*.{ts,tsx}",
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node },
    },
  },
  {
    files: ["e2e/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='route'][callee.object.name='page']",
          message:
            "E2E'de page.route API mock yasak — gerçek Django kullanın.",
        },
      ],
    },
  },
]);
