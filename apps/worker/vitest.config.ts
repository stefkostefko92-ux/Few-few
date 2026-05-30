import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The worker's jobs are integration-level (DB/Redis); unit coverage lives
    // in @aso/shared + @aso/api. Don't fail CI when there are no unit specs.
    passWithNoTests: true,
  },
});
