import { defineConfig } from "@playwright/test";

const e2ePort = process.env.E2E_PORT ?? "3000";
const e2eBaseURL = process.env.E2E_BASE_URL ?? `http://localhost:${e2ePort}`;
const e2eHostname = new URL(e2eBaseURL).hostname;
const isLocalE2E = ["localhost", "127.0.0.1", "::1"].includes(e2eHostname);
const e2eWebServerCommand =
  process.env.E2E_WEB_SERVER_COMMAND ??
  `npm run dev -- --webpack --hostname 127.0.0.1 --port ${e2ePort}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: e2eBaseURL,
    headless: true,
    ...(isLocalE2E
      ? {
          launchOptions: {
            args: ["--host-resolver-rules=MAP dao-beta.dao-ops.com 127.0.0.1"],
          },
        }
      : {}),
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: e2eWebServerCommand,
    url: e2eBaseURL,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "true",
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_E2E: process.env.NEXT_PUBLIC_E2E ?? "true",
      NEXT_PUBLIC_USE_MOCKS: process.env.NEXT_PUBLIC_USE_MOCKS ?? "true",
      ...(isLocalE2E
        ? {
            NEXT_PUBLIC_RPC_URLS:
              process.env.NEXT_PUBLIC_RPC_URLS ?? "http://127.0.0.1:8546",
          }
        : {}),
    },
  },
  projects: [
    { name: "dao-feed", testDir: "tests/e2e/dao-feed" },
    {
      name: "smoke",
      testDir: "tests/e2e/smoke",
    },
    {
      name: "full",
      testDir: "tests/e2e/full",
    },
  ],
});
