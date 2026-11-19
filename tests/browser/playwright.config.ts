import { defineConfig } from "@playwright/test";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// E2E over the BUILT static artifact (serves apps/web/dist): navigation,
// empty states, timeline fixture demo, keyboard access, reduced motion.
// Requires `npm run build` first. CI-grade; failures block release.
export default defineConfig({
  testDir: "./test",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:4173" },
  webServer: {
    command: `bash ${join(here, "..", "..", "scripts", "serve-dist.sh")}`,
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
