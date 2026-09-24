// Only the local built-app launcher imports this file. No Worker code uses it.
import assert from "node:assert/strict";
import { getPlatformProxy } from "wrangler";
import { verifyFork, requireCleanSource } from "./dao-local-validation-config.mjs";
assert.equal(process.env.NEXT_PUBLIC_RUNTIME_MODE, "development");
assert.equal(process.env.DAO_UAT_PROVIDER, "offline");
assert.ok(process.env.DAO_PUBLICATION_LOCAL_STATE);
await requireCleanSource();
await verifyFork(process.env.DAO_FORK_RPC);
const platform = await getPlatformProxy({ configPath: "wrangler.jsonc", remoteBindings: false, envFiles: [],
  persist: { path: process.env.DAO_PUBLICATION_LOCAL_STATE } });
globalThis[Symbol.for("__cloudflare-context__")] = { env: platform.env, cf: platform.cf, ctx: platform.ctx };
