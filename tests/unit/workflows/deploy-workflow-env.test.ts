import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const expectedRuntimeEnv: Record<string, string> = {
  NODE_ENV: "production",
  NEXT_PUBLIC_RUNTIME_MODE: "production",
  NEXT_PUBLIC_USE_MOCKS: '"false"',
  NEXT_PUBLIC_E2E: '"false"',
  NEXT_PUBLIC_ENABLE_DEBUG_UI: '"false"',
  NEXT_PUBLIC_ENABLE_TEAMS:
    "${{ vars.NEXT_PUBLIC_ENABLE_TEAMS || secrets.NEXT_PUBLIC_ENABLE_TEAMS || 'false' }}",
  NEXT_PUBLIC_ENABLE_YBC:
    "${{ vars.NEXT_PUBLIC_ENABLE_YBC || secrets.NEXT_PUBLIC_ENABLE_YBC || 'false' }}",
  NEXT_PUBLIC_ENABLE_YETH:
    "${{ vars.NEXT_PUBLIC_ENABLE_YETH || secrets.NEXT_PUBLIC_ENABLE_YETH || 'false' }}",
  NEXT_PUBLIC_WC_PROJECT_ID:
    "${{ secrets.NEXT_PUBLIC_WC_PROJECT_ID || vars.NEXT_PUBLIC_WC_PROJECT_ID }}",
  NEXT_PUBLIC_GLOBAL_DATA_URL:
    "${{ vars.NEXT_PUBLIC_GLOBAL_DATA_URL || secrets.NEXT_PUBLIC_GLOBAL_DATA_URL }}",
  NEXT_PUBLIC_TEAMS_DATA_URL:
    "${{ vars.NEXT_PUBLIC_TEAMS_DATA_URL || secrets.NEXT_PUBLIC_TEAMS_DATA_URL }}",
  NEXT_PUBLIC_YBC_DATA_URL:
    "${{ vars.NEXT_PUBLIC_YBC_DATA_URL || secrets.NEXT_PUBLIC_YBC_DATA_URL }}",
  NEXT_PUBLIC_YETH_GLOBAL_DATA_URL:
    "${{ secrets.NEXT_PUBLIC_YETH_GLOBAL_DATA_URL || vars.NEXT_PUBLIC_YETH_GLOBAL_DATA_URL }}",
  NEXT_PUBLIC_RPC_URLS:
    "${{ secrets.NEXT_PUBLIC_RPC_URLS || vars.NEXT_PUBLIC_RPC_URLS }}",
};

const preprodDaoFlag =
  "${{ vars.NEXT_PUBLIC_ENABLE_DAO || secrets.NEXT_PUBLIC_ENABLE_DAO || 'false' }}";
const preprodDaoReviewControlsFlag =
  "${{ vars.NEXT_PUBLIC_ENABLE_DAO_REVIEW_CONTROLS || secrets.NEXT_PUBLIC_ENABLE_DAO_REVIEW_CONTROLS || 'false' }}";

function expectedRuntimeEnvFor(relativePath: string) {
  return {
    ...expectedRuntimeEnv,
    ...(relativePath.includes("preprod") ? {
      NEXT_PUBLIC_DAO_DEPLOYMENTS: "${{ vars.NEXT_PUBLIC_DAO_DEPLOYMENTS }}",
      NEXT_PUBLIC_ENABLE_SIMULATION_TRANSPORT_FALLBACK: '"false"',
    } : {}),
    NEXT_PUBLIC_ENABLE_DAO: relativePath.includes("preprod")
      ? preprodDaoFlag
      : '"false"',
    NEXT_PUBLIC_ENABLE_DAO_REVIEW_CONTROLS: relativePath.includes("preprod")
      ? preprodDaoReviewControlsFlag
      : '"false"',
  };
}

function parseEnvLines(linesBlock: string) {
  const result: Record<string, string> = {};
  const lines = linesBlock.trimEnd().split("\n");
  for (const line of lines) {
    const match = line.match(/^\s{10}([A-Z0-9_]+):\s*(.+)$/);
    if (!match) continue;
    result[match[1]] = match[2].trim();
  }
  return result;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseStepEnvByRun(workflowPath: string, runCommand: string) {
  const content = readFileSync(workflowPath, "utf8");
  const envBlockPattern = new RegExp(
    `^\\s{6}- name: .+\\n\\s{8}env:\\n((?:^\\s{10}[A-Z0-9_]+:.*\\n)+)\\s{8}run:\\s+${escapeRegex(runCommand)}$`,
    "m"
  );
  const envBlock = content.match(envBlockPattern);
  if (!envBlock) {
    throw new Error(`Missing env block for step run command "${runCommand}" in ${workflowPath}`);
  }
  return parseEnvLines(envBlock[1]);
}

describe("deploy workflow env wiring", () => {
  const workflows = [
    ".github/workflows/deploy-preprod.yml",
    ".github/workflows/deploy-production.yml",
  ];

  for (const relativePath of workflows) {
    const workflowPath = path.resolve(process.cwd(), relativePath);
    const deployCommand = relativePath.includes("preprod")
      ? "npm run worker:deploy:preprod"
      : "npm run worker:deploy:prod";

    it(`${relativePath} keeps production runtime env on validation step`, () => {
      expect(parseStepEnvByRun(workflowPath, "npm run validate:prod-env")).toEqual(
        expectedRuntimeEnvFor(relativePath)
      );
    });

    it(`${relativePath} keeps production runtime env on build step`, () => {
      expect(parseStepEnvByRun(workflowPath, "npm run worker:build")).toEqual(
        expectedRuntimeEnvFor(relativePath)
      );
    });

    it(`${relativePath} keeps runtime env and Cloudflare creds on deploy step`, () => {
      expect(parseStepEnvByRun(workflowPath, deployCommand)).toEqual({
        ...expectedRuntimeEnvFor(relativePath),
        CLOUDFLARE_ACCOUNT_ID: "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
        CLOUDFLARE_API_TOKEN: "${{ secrets.CLOUDFLARE_API_TOKEN }}",
      });
    });
  }
});

describe("preprod worker routes", () => {
  it("registers all beta custom domains", () => {
    const wranglerConfig = readFileSync(
      path.resolve(process.cwd(), "wrangler.preprod.jsonc"),
      "utf8"
    );

    for (const host of [
      "styfi-beta.dao-ops.com",
      "veyfi-beta.dao-ops.com",
      "teams-beta.dao-ops.com",
      "yeth-beta.dao-ops.com",
      "ybc-beta.dao-ops.com",
      "dao-beta.dao-ops.com",
    ]) {
      expect(wranglerConfig).toContain(`"pattern": "${host}"`);
    }
  });

  it("does not register the reserved DAO production host", () => {
    const wranglerConfig = readFileSync(
      path.resolve(process.cwd(), "wrangler.jsonc"),
      "utf8"
    );

    expect(wranglerConfig).not.toContain('"pattern": "dao.yearn.fi"');
  });
});

describe("web worker observability", () => {
  const expectedObservabilityConfig = [
    '  "observability": {',
    '    "enabled": true,',
    '    "head_sampling_rate": 1,',
    '    "logs": {',
    '      "enabled": true,',
    '      "head_sampling_rate": 1,',
    '      "invocation_logs": true,',
    '      "persist": true',
  ].join("\n");

  for (const relativePath of ["wrangler.jsonc", "wrangler.preprod.jsonc"]) {
    it(`${relativePath} persists sampled invocation logs`, () => {
      const wranglerConfig = readFileSync(
        path.resolve(process.cwd(), relativePath),
        "utf8"
      );

      expect(wranglerConfig).toContain(expectedObservabilityConfig);
    });
  }
});
