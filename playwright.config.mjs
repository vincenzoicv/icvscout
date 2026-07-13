import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: process.env.ICV_E2E_BASE_URL || "http://127.0.0.1:8788",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: true } },
  ],
  webServer: process.env.ICV_E2E_BASE_URL ? undefined : {
    command: "npx wrangler pages dev . --port 8788",
    url: "http://127.0.0.1:8788/community",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
