import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { mockApiPlugin } from "./mock-api-plugin.ts";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const useMock =
    (process.env.VITE_USE_MOCK ?? env.VITE_USE_MOCK ?? "")
      .trim()
      .toLowerCase() === "true";
  const rawDjangoOrigin = (
    process.env.DJANGO_ORIGIN ??
    env.DJANGO_ORIGIN ??
    ""
  ).trim();
  const djangoTarget = rawDjangoOrigin || "http://127.0.0.1:8000";

  return {
    base: "/",
    plugins: [
      react(),
      tailwindcss(),
      ...(useMock ? [mockApiPlugin()] : []),
    ],
    resolve: {
      alias: {
        "@": path.resolve(process.cwd(), "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Vendor chunk'ları ayır — ana bundle'u küçült
            if (id.includes("node_modules")) {
              if (id.includes("react") || id.includes("react-dom")) {
                return "vendor-react";
              }
              if (id.includes("@tanstack")) {
                return "vendor-tanstack";
              }
              if (id.includes("react-router")) {
                return "vendor-router";
              }
              if (id.includes("@radix-ui")) {
                return "vendor-radix";
              }
              if (id.includes("lucide-react")) {
                return "vendor-lucide";
              }
              return "vendor-other";
            }
          },
        },
      },
    },
    server: {
      host: "0.0.0.0",
      port: 3000,
      allowedHosts: true,
      ...(!useMock
        ? {
            proxy: {
              "/api": {
                target: djangoTarget,
                changeOrigin: true,
              },
              "/media": {
                target: djangoTarget,
                changeOrigin: true,
              },
            },
          }
        : {}),
    },
    preview: {
      host: "0.0.0.0",
      port: 3000,
      allowedHosts: true,
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
    },
  };
});
