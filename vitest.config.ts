import { defineConfig } from "vitest/config";
import path from "node:path";

// hallConfig.ts (and its dependency src/lib/constants.ts) resolve the "@/*"
// path alias declared in tsconfig.json — vitest/vite needs the same mapping
// since it doesn't read tsconfig "paths" on its own.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
