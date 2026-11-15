import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

const srcDir = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "");
  // İstemci bundle'ına sızmasın diye VITE_ öneki yok (USE_MOCK).
  const useMock =
    (process.env.USE_MOCK ?? env.USE_MOCK ?? process.env.VITE_USE_MOCK ?? env.VITE_USE_MOCK ?? "")
      .trim()
      .toLowerCase() === "true";
  const isDeployMode = mode === "production" || mode === "staging";
  if (useMock && isDeployMode) {
    throw new Error(
      "USE_MOCK=true production/staging build'de yasak. Django API kullanın."
    );
  }

  const rawDjangoOrigin = (
    process.env.DJANGO_ORIGIN ??
    env.DJANGO_ORIGIN ??
    ""
  ).trim();
  const djangoTarget = rawDjangoOrigin || "http://127.0.0.1:8000";

  const plugins = [react(), tailwindcss()] as import("vite").PluginOption[];
  if (useMock) {
    // Dinamik yol: tools/ tsconfig dışı (offline-only); tip çözümlemesi yapılmaz.
    const mockPath = "./tools/mock-api-plugin.ts";
    const mod = (await import(/* @vite-ignore */ mockPath)) as {
      mockApiPlugin: () => import("vite").Plugin;
    };
    plugins.push(mod.mockApiPlugin());
  }

  return {
    base: "/",
    plugins,
    resolve: {
      alias: {
        "@": srcDir,
      },
    },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: "vendor-react",
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler)([\\/]|$)/,
                priority: 40,
              },
              {
                name: "vendor-router",
                test: /[\\/]node_modules[\\/]react-router(-dom)?([\\/]|$)/,
                priority: 30,
              },
              {
                name: "vendor-tanstack",
                test: /[\\/]node_modules[\\/]@tanstack[\\/]/,
                priority: 30,
              },
              {
                name: "vendor-radix",
                test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
                priority: 20,
              },
              {
                name: "vendor-lucide",
                test: /[\\/]node_modules[\\/]lucide-react([\\/]|$)/,
                priority: 20,
              },
              {
                name: "vendor-other",
                test: /[\\/]node_modules[\\/]/,
                priority: 10,
              },
            ],
          },
        },
      },
    },
    server: {
      // Varsayılan loopback; LAN için `npm run dev:lan` (--host 0.0.0.0)
      host: "127.0.0.1",
      port: 3000,
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
      host: "127.0.0.1",
      port: 3000,
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: ["./src/test/setup.ts"],
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
    },
  };
});
