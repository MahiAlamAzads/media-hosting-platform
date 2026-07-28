import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup/setup-env.ts"],
    clearMocks: true,
    restoreMocks: true,
    mockReset: true,
    sequence: {
      concurrent: false
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: [
        "src/modules/**/*.ts",
        "src/shared/**/*.ts",
        "src/infrastructure/**/*.ts"
      ],
      exclude: [
        "tests/**",
        "src/server.ts",
        "src/types.d.ts"
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70
      }
    }
  }
});
