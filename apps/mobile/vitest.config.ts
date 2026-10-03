import { defineConfig } from "vitest/config";

// Only the platform-free modules are unit tested here (no React Native runtime).
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
