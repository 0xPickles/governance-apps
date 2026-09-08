import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import assert from "node:assert/strict";

const deployments = JSON.parse(await readFile("docs/apps/dao/examples/feed-v2/deployments.example.json", "utf8"));
const disabled = process.argv.includes("--disabled");
const extraArgs = process.argv.slice(2).filter(arg => arg !== "--disabled");
const port = process.env.E2E_PORT ?? "3131";
const env = { ...process.env, E2E_PORT: port, E2E_BASE_URL: "http://127.0.0.1:" + port,
  NEXT_PUBLIC_RUNTIME_MODE: "production", NEXT_PUBLIC_ENABLE_DAO: String(!disabled),
  NEXT_PUBLIC_DAO_DEPLOYMENTS: JSON.stringify(disabled ? [] : deployments),
  NEXT_PUBLIC_USE_MOCKS: "false", NEXT_PUBLIC_E2E: "false",
  NEXT_PUBLIC_ENABLE_DEBUG_UI: "false", NEXT_PUBLIC_ENABLE_DAO_REVIEW_CONTROLS: "false",
  E2E_EXPECT_DAO_PRODUCTION_FAIL_CLOSED: String(disabled),
};
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolve() : reject(new Error("Local V2 validation exited " + code)));
  });
}
await run(["node_modules/next/dist/bin/next", "build", "--webpack"]);
env.E2E_WEB_SERVER_COMMAND = "npm run start -- --hostname 127.0.0.1 --port " + port;
const bytes = await readFile("docs/apps/dao/examples/feed-v2/dao-feed-v2.example.json");
let upstreamRequests = 0;
const upstream = createServer((_request, response) => {
  upstreamRequests++;
  response.writeHead(200, { "content-type": "application/json" });
  response.end(bytes);
});
await new Promise(resolve => upstream.listen(0, "127.0.0.1", resolve));
env.DAO_DATA_URL = `http://127.0.0.1:${upstream.address().port}/dao.json`;
env.E2E_DAO_TEST_UPSTREAM = "true";
try {
  await run([
    "node_modules/@playwright/test/cli.js", "test", "--workers=1",
    ...(disabled ? ["--project=smoke", "--grep", "fails closed for production DAO requests"] : ["--project=dao-feed"]),
    ...extraArgs,
  ]);
  if (disabled) assert.equal(upstreamRequests, 0, "Disabled DAO must never contact its configured upstream");
  else assert.ok(upstreamRequests >= 2, "Enabled GET and HEAD must exercise the actual upstream");
  console.log(`DAO upstream requests (${disabled ? "disabled" : "enabled"}): ${upstreamRequests}`);
} finally {
  await new Promise((resolve, reject) => upstream.close(error => error ? reject(error) : resolve()));
}
