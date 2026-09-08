import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

const root = process.cwd();
const server = await createServer({ configFile: resolve(root, "vitest.config.mts"), server: { middlewareMode: true, hmr: false, ws: false } });
try {
  const { z } = await server.ssrLoadModule("/lib/schemas/zod.ts");
  const schema = await server.ssrLoadModule("/lib/schemas/dao-feed.ts");
  const fixtures = await server.ssrLoadModule("/tests/fixtures/dao-feed-v2.ts");
  const mocks = await server.ssrLoadModule("/lib/clients/dao/fixtures.ts");
  const feed = schema.parseDaoFeed(fixtures.createV2Example());
  const generated = z.toJSONSchema(schema.DaoFeedSchema, { target: "draft-7", io: "input", reused: "ref" });
  const outputs = [
    ["docs/apps/dao/examples/mock-data.example.json", mocks.DAO_MOCK_FEED_JSON],
    ["docs/apps/dao/feed-schema-v2.schema.json", { ...generated, $id: schema.DAO_FEED_SCHEMA_ID, title: "Yearn DAO feed V2" }],
    ["docs/apps/dao/examples/feed-v2/dao-feed-v2.example.json", feed],
    ["docs/apps/dao/examples/feed-v2/deployments.example.json", fixtures.V2_DEPLOYMENTS],
  ];
  const check = process.argv.includes("--check");
  for (const [path, value] of outputs) {
    const bytes = JSON.stringify(value, null, 2) + "\n";
    if (check) {
      if (await readFile(resolve(root, path), "utf8") !== bytes) throw new Error("Generated DAO artifact differs: " + path);
    } else {
      await mkdir(resolve(root, path, ".."), { recursive: true });
      await writeFile(resolve(root, path), bytes);
    }
  }
} finally { await server.close(); }
